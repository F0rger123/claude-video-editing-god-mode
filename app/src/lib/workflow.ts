import "server-only";
import { decideIntake, nextReviewStage } from "@/lib/domain/automation";
import { composeText, copyProblems, type PostCopy } from "@/lib/domain/captions";
import { buildInstructions, instructionsToNote, type FeedbackItem } from "@/lib/domain/feedback";
import { normalizePermissions } from "@/lib/domain/permissions";
import { decideQuota, periodStarts, type QuotaDecision, type UsageCounts } from "@/lib/domain/quota";
import { resolvePostTime } from "@/lib/domain/schedule";
import { COUNTED_EDIT_STATUSES, ACTIVE_EDIT_STATUSES, assertTransition } from "@/lib/domain/status";
import type { Job, JobStatus, Platform, Workspace } from "@/lib/domain/types";
import type { AdminClient } from "@/lib/supabase/admin";
import { BufferAdapter, PublishingError, mapRemoteStatus, platformFromService, type PublishingAdapter } from "@/lib/integrations/buffer";
import { generateCopy } from "@/lib/integrations/captions";
import { audit, notify } from "@/lib/integrations/notify";
import { signedViewUrl } from "@/lib/integrations/storage";
import { InstagramClient, PREPARE_AHEAD_MS, containerFromKey, containerKey, instagramApp, mediaKey, needsRefresh, nextContainerStep, userIdFromChannelKey } from "@/lib/integrations/instagram";
import { YouTubeClient, fromKey, mapYouTubeState, watchUrl, youtubeApp, youtubeVideoKey } from "@/lib/integrations/youtube";

/**
 * Workflow engine. Every state change that involves rules (quota, automation, approvals,
 * scheduling, Buffer) goes through here, whether it was triggered by a person (server action,
 * after its own permission check), by the editor bridge, or by the cron tick.
 * Functions take the service-role client: callers are responsible for authorisation.
 */

export type Actor = { id: string | null; label: string };
const SYSTEM: Actor = { id: null, label: "system" };

export async function loadWorkspace(admin: AdminClient, id: string): Promise<Workspace> {
  const { data, error } = await admin.from("content_workspaces").select("*").eq("id", id).single();
  if (error || !data) throw new Error("Workspace not found.");
  return data as Workspace;
}

export async function loadJob(admin: AdminClient, id: string): Promise<Job> {
  const { data, error } = await admin.from("content_jobs").select("*").eq("id", id).single();
  if (error || !data) throw new Error("Job not found.");
  return data as Job;
}

async function setStatus(admin: AdminClient, job: Job, to: JobStatus, patch: Record<string, unknown> = {}) {
  assertTransition(job.status, to);
  const { error, count } = await admin
    .from("content_jobs")
    .update({ status: to, ...patch }, { count: "exact" })
    .eq("id", job.id)
    .eq("status", job.status); // optimistic: refuse if someone else moved it meanwhile
  if (error) throw new Error(error.message);
  if (!count) throw new Error("This job changed in the meantime. Refresh and try again.");
}

async function upsertInternal(admin: AdminClient, job: Pick<Job, "id" | "workspace_id">, patch: Record<string, unknown>) {
  await admin.from("content_job_internal").upsert({ job_id: job.id, workspace_id: job.workspace_id, ...patch }, { onConflict: "job_id" });
}

// ── Quota ──────────────────────────────────────────────────────────────────

export async function usageFor(admin: AdminClient, workspaceId: string, now = new Date()): Promise<UsageCounts> {
  const { monthStart, weekStart } = periodStarts(now);
  const counted = COUNTED_EDIT_STATUSES;
  const head = { count: "exact" as const, head: true };
  const [raw, shortM, longM, week, active, deliverables, published] = await Promise.all([
    admin.from("content_media").select("id", head).eq("workspace_id", workspaceId).gte("created_at", monthStart),
    admin.from("content_jobs").select("id", head).eq("workspace_id", workspaceId).eq("form", "short").in("status", counted).gte("queued_at", monthStart),
    admin.from("content_jobs").select("id", head).eq("workspace_id", workspaceId).eq("form", "long").in("status", counted).gte("queued_at", monthStart),
    admin.from("content_jobs").select("id", head).eq("workspace_id", workspaceId).in("status", counted).gte("queued_at", weekStart),
    admin.from("content_jobs").select("id", head).eq("workspace_id", workspaceId).in("status", ACTIVE_EDIT_STATUSES),
    admin.from("content_jobs").select("id", head).eq("workspace_id", workspaceId).gte("approved_at", monthStart),
    admin.from("content_posts").select("id", head).eq("workspace_id", workspaceId).eq("status", "published").gte("published_at", monthStart),
  ]);
  return {
    rawFiles: raw.count ?? 0,
    shortJobsThisMonth: shortM.count ?? 0,
    longJobsThisMonth: longM.count ?? 0,
    jobsThisWeek: week.count ?? 0,
    activeJobs: active.count ?? 0,
    deliverablesThisMonth: deliverables.count ?? 0,
    publishedThisMonth: published.count ?? 0,
  };
}

async function quotaFor(admin: AdminClient, ws: Workspace, job: Job): Promise<QuotaDecision> {
  const { data: media } = await admin.from("content_media").select("duration_seconds, role, kind").eq("job_id", job.id);
  const primary = (media ?? []).find((m) => m.role === "primary") ?? (media ?? []).find((m) => m.kind === "video");
  const durationMinutes = primary?.duration_seconds ? Number(primary.duration_seconds) / 60 : null;
  return decideQuota(ws.package ?? {}, await usageFor(admin, ws.id), { form: job.form, durationMinutes, platforms: job.platforms }, ws.overage_behavior);
}

// ── Intake: incoming job → pending approval or queued ─────────────────────

export async function intakeJob(admin: AdminClient, jobId: string, actor: Actor = SYSTEM): Promise<{ next: JobStatus; reasons: string[] }> {
  const job = await loadJob(admin, jobId);
  if (job.status !== "incoming") return { next: job.status, reasons: [] };
  const ws = await loadWorkspace(admin, job.workspace_id);
  const { data: media } = await admin.from("content_media").select("kind, role, duration_seconds, uploaded_by, review_status").eq("job_id", job.id);
  const list = (media ?? []).filter((m) => m.review_status !== "rejected");
  const primary = list.find((m) => m.role === "primary") ?? list.find((m) => m.kind === "video");
  let clientPermissions = null;
  if (job.source === "client" && job.created_by) {
    const { data: member } = await admin.from("content_members").select("permissions").eq("workspace_id", ws.id).eq("user_id", job.created_by).is("revoked_at", null).maybeSingle();
    clientPermissions = normalizePermissions(member?.permissions);
  }
  const quota = await quotaFor(admin, ws, job);
  const decision = decideIntake({
    mode: ws.automation_mode,
    rules: ws.conditional_rules ?? {},
    form: job.form,
    source: job.source,
    hasPrimaryVideo: Boolean(primary),
    hasReference: list.some((m) => m.role === "reference" || m.kind.startsWith("reference") || m.kind === "link"),
    durationMinutes: primary?.duration_seconds ? Number(primary.duration_seconds) / 60 : null,
    category: job.category,
    clientPermissions,
    quota,
  });

  await upsertInternal(admin, job, { quota_snapshot: { quota, reasons: decision.reasons, at: new Date().toISOString() }, billable_overage: decision.billable });
  if (decision.next === "queued") {
    await setStatus(admin, job, "queued", { queued_at: new Date().toISOString() });
    await audit(admin, { workspaceId: ws.id, actorId: actor.id, actorLabel: actor.label, action: "job_started", entity: "job", entityId: job.id, detail: { auto: true, billable: decision.billable } });
  } else {
    await setStatus(admin, job, "pending_approval");
    if (quota.outcome !== "ok") {
      await notify(admin, { kind: "quota_reached", title: `${ws.name}: package limit`, body: quota.issues.map((i) => i.message).join(" "), workspaceId: ws.id, jobId: job.id, link: `/jobs/${job.id}` });
    }
  }
  if (job.source === "client") {
    await notify(admin, { kind: "client_upload", title: `${ws.name} uploaded: ${job.title}`, body: decision.next === "queued" ? "Editing started automatically." : decision.reasons.join(" "), workspaceId: ws.id, jobId: job.id, link: decision.next === "queued" ? `/jobs/${job.id}` : "/inbox" });
  }
  return { next: decision.next, reasons: decision.reasons };
}

/** Owner/agency approves a job for editing (Pending Approval → Queued). */
export async function approveForEditing(admin: AdminClient, jobId: string, actor: Actor, opts: { allowOverage: boolean; isOwner: boolean }) {
  const job = await loadJob(admin, jobId);
  if (job.status !== "pending_approval" && job.status !== "incoming" && job.status !== "failed") {
    throw new Error("Only pending jobs can be approved for editing.");
  }
  const ws = await loadWorkspace(admin, job.workspace_id);
  const { count } = await admin.from("content_media").select("id", { count: "exact", head: true }).eq("job_id", job.id).in("kind", ["video", "broll"]).neq("review_status", "rejected");
  if (!count) throw new Error("Add at least one video clip before editing.");
  const quota = await quotaFor(admin, ws, job);
  let billable = false;
  if (quota.outcome === "blocked" && !opts.allowOverage) throw new Error(`Package limit: ${quota.issues.map((i) => i.message).join(" ")}`);
  if ((quota.outcome === "needs_owner" || quota.outcome === "blocked") && !opts.isOwner) throw new Error("Over the package limit: the owner must approve this one.");
  if (quota.outcome === "billable" || ((quota.outcome === "needs_owner" || quota.outcome === "blocked") && opts.allowOverage)) billable = true;

  const from = job.status === "incoming" ? { ...job, status: "pending_approval" as JobStatus } : job;
  if (job.status === "incoming") await setStatus(admin, job, "pending_approval");
  await setStatus(admin, from, "queued", { queued_at: job.queued_at ?? new Date().toISOString(), needs_attention: false, attention_reason: null });
  await upsertInternal(admin, job, { billable_overage: billable, overage_approved_by: billable ? actor.id : null, quota_snapshot: { quota, at: new Date().toISOString() }, last_error: null });
  await audit(admin, { workspaceId: ws.id, actorId: actor.id, actorLabel: actor.label, action: "approved_for_editing", entity: "job", entityId: job.id, detail: { billable } });
}

// ── Review routing (after the editor returns a version) ───────────────────

/** Bridge sets status=review with review_stage=null; this decides who looks next (or approves). */
export async function routeReview(admin: AdminClient, job: Job, ws: Workspace) {
  const { data: internal } = await admin.from("content_job_internal").select("editor_ref").eq("job_id", job.id).maybeSingle();
  const lowConfidence = Boolean((internal?.editor_ref as { needs_review?: string } | null)?.needs_review);
  const stage = nextReviewStage(ws.automation_mode, ws.approval_rules ?? {}, lowConfidence || job.needs_attention);
  if (stage === null) {
    await approveJob(admin, job.id, SYSTEM, { auto: true });
    return;
  }
  await admin.from("content_jobs").update({ review_stage: stage }).eq("id", job.id).eq("status", "review");
  if (stage === "client" && job.current_version_id) {
    await admin.from("content_versions").update({ client_visible: true }).eq("id", job.current_version_id);
    await notify(admin, { kind: "approval_needed", audience: "member", title: `New draft ready: ${job.title}`, workspaceId: ws.id, jobId: job.id, link: `/portal/${ws.slug}/review/${job.id}` });
  } else {
    await notify(admin, { kind: "edit_complete", title: `${ws.name}: ${job.title} is ready to review`, workspaceId: ws.id, jobId: job.id, link: `/jobs/${job.id}` });
  }
}

/** Agency passes its review: either approve, or release to the client when client review is on. */
export async function agencyPass(admin: AdminClient, jobId: string, actor: Actor) {
  const job = await loadJob(admin, jobId);
  if (job.status !== "review") throw new Error("This job is not in review.");
  const ws = await loadWorkspace(admin, job.workspace_id);
  if (ws.approval_rules?.client_review && ws.access_mode === "client_collab") {
    await admin.from("content_jobs").update({ review_stage: "client" }).eq("id", job.id);
    if (job.current_version_id) await admin.from("content_versions").update({ client_visible: true }).eq("id", job.current_version_id);
    await audit(admin, { workspaceId: ws.id, actorId: actor.id, actorLabel: actor.label, action: "sent_to_client", entity: "job", entityId: job.id });
    await notify(admin, { kind: "approval_needed", audience: "member", title: `New draft ready: ${job.title}`, workspaceId: ws.id, jobId: job.id, link: `/portal/${ws.slug}/review/${job.id}` });
    return "client" as const;
  }
  await approveJob(admin, job.id, actor, { auto: false });
  return "approved" as const;
}

export async function approveJob(admin: AdminClient, jobId: string, actor: Actor, opts: { auto: boolean }) {
  const job = await loadJob(admin, jobId);
  if (job.status !== "review" && job.status !== "approved") throw new Error("Only a job in review can be approved.");
  if (job.status === "review") await setStatus(admin, job, "approved", { review_stage: null, approved_at: job.approved_at ?? new Date().toISOString() });
  if (job.current_version_id) {
    await admin.from("content_versions").update({ decision: "approved", decided_by: actor.id, decided_at: new Date().toISOString() }).eq("id", job.current_version_id);
  }
  await audit(admin, { workspaceId: job.workspace_id, actorId: actor.id, actorLabel: actor.label, action: opts.auto ? "auto_approved" : "approved", entity: "job", entityId: job.id });
  await planPosts(admin, { ...job, status: "approved" });
}

// ── Revisions ─────────────────────────────────────────────────────────────

export async function requestChanges(
  admin: AdminClient,
  jobId: string,
  actor: Actor,
  opts: { note?: string | null; decision: "changes_requested" | "rerecord" | "rejected"; isOwner: boolean; allowOverage?: boolean },
) {
  const job = await loadJob(admin, jobId);
  if (!["review", "needs_changes", "approved"].includes(job.status)) throw new Error("Changes can only be requested on a delivered version.");
  const ws = await loadWorkspace(admin, job.workspace_id);
  const { data: version } = job.current_version_id
    ? await admin.from("content_versions").select("id, number").eq("id", job.current_version_id).single()
    : { data: null };
  if (version) await admin.from("content_versions").update({ decision: opts.decision, decided_by: actor.id, decided_at: new Date().toISOString() }).eq("id", version.id);

  if (opts.decision === "rejected") {
    // The reason is kept as feedback; the bridge hands it to the editor's taste learning (4 Rate/No note).
    if (opts.note) await admin.from("content_feedback").insert({ job_id: job.id, version_id: version?.id ?? null, workspace_id: ws.id, author_id: actor.id, author_label: actor.label, body: `Rejected: ${opts.note}`, internal: true });
    await setStatus(admin, job, "archived", { review_stage: null });
    await audit(admin, { workspaceId: ws.id, actorId: actor.id, actorLabel: actor.label, action: "rejected", entity: "job", entityId: job.id, detail: { note: opts.note } });
    return;
  }
  if (opts.decision === "rerecord") {
    if (opts.note) await admin.from("content_feedback").insert({ job_id: job.id, version_id: version?.id ?? null, workspace_id: ws.id, author_id: actor.id, author_label: actor.label, body: `Re-record requested: ${opts.note}` });
    await setStatus(admin, job, job.status === "review" ? "needs_changes" : job.status, { review_stage: null, needs_attention: true, attention_reason: "Waiting for new footage (re-record)." });
    await audit(admin, { workspaceId: ws.id, actorId: actor.id, actorLabel: actor.label, action: "rerecord_requested", entity: "job", entityId: job.id });
    if (ws.access_mode !== "agency_only") await notify(admin, { kind: "approval_needed", audience: "member", title: `Please re-record: ${job.title}`, body: opts.note, workspaceId: ws.id, jobId: job.id, link: `/portal/${ws.slug}/upload?job=${job.id}` });
    return;
  }

  // Revision allowance.
  const quota = decideQuota(ws.package ?? {}, await usageFor(admin, ws.id), { form: job.form, revisionRound: job.revision_count }, ws.overage_behavior);
  if (quota.outcome === "blocked" && !opts.allowOverage) throw new Error(quota.issues[0].message);
  if ((quota.outcome === "needs_owner" || quota.outcome === "blocked") && !opts.isOwner) throw new Error(`${quota.issues[0].message} The owner must approve another round.`);

  const { data: feedback } = await admin
    .from("content_feedback")
    .select("body, at_seconds, reference_url, author_label, internal, media:content_media(file_name)")
    .eq("job_id", job.id)
    .eq("version_id", version?.id ?? "00000000-0000-0000-0000-000000000000")
    .order("created_at");
  const { data: newMedia } = await admin.from("content_media").select("file_name, url").eq("job_id", job.id).gt("created_at", job.updated_at);
  const items: FeedbackItem[] = (feedback ?? []).map((f) => ({
    body: f.body,
    at_seconds: f.at_seconds === null ? null : Number(f.at_seconds),
    reference_url: f.reference_url,
    author_label: f.author_label,
    internal: f.internal,
  }));
  const instructions = buildInstructions(items, {
    round: job.revision_count + 1,
    fromVersion: version?.number ?? 1,
    extraNote: opts.note,
    newMedia: (newMedia ?? []).map((m) => m.file_name || m.url).filter(Boolean) as string[],
  });
  await admin.from("content_revisions").insert({
    job_id: job.id,
    workspace_id: ws.id,
    from_version_id: version?.id ?? null,
    round: instructions.round,
    // `note` is the exact text the bridge hands to the editor's "Try again" flow.
    instructions: { ...instructions, note: instructionsToNote(instructions) },
    requested_by: actor.id,
  });
  if (job.status !== "needs_changes") await setStatus(admin, job, "needs_changes", { review_stage: null });
  await setStatus(admin, { ...job, status: "needs_changes" }, "queued", { revision_count: job.revision_count + 1, needs_attention: false, attention_reason: null });
  if (quota.outcome !== "ok") await upsertInternal(admin, job, { billable_overage: true });
  // Cancel any not-yet-sent posts of the old version.
  await admin.from("content_posts").update({ status: "cancelled" }).eq("job_id", job.id).in("status", ["draft", "awaiting_approval", "approved"]).is("buffer_post_id", null);
  await audit(admin, { workspaceId: ws.id, actorId: actor.id, actorLabel: actor.label, action: "revision_requested", entity: "job", entityId: job.id, detail: { round: instructions.round, summary: instructions.summary } });
}

// ── Posts: copy + slot + approval state ───────────────────────────────────

/** Posting times already taken in a workspace (from yesterday on), optionally ignoring one post. */
export async function existingSlots(admin: AdminClient, workspaceId: string, exceptPostId?: string) {
  const { data } = await admin
    .from("content_posts")
    .select("id, scheduled_at, platform")
    .eq("workspace_id", workspaceId)
    .not("scheduled_at", "is", null)
    .not("status", "in", "(cancelled,failed)")
    .gte("scheduled_at", new Date(Date.now() - 86400e3).toISOString());
  return (data ?? []).filter((p) => p.id !== exceptPostId).map((p) => ({ at: new Date(p.scheduled_at as string), platform: p.platform as string }));
}

export async function planPosts(admin: AdminClient, job: Job) {
  const ws = await loadWorkspace(admin, job.workspace_id);
  const { data: existing } = await admin.from("content_posts").select("platform").eq("job_id", job.id).neq("status", "cancelled");
  const have = new Set((existing ?? []).map((p) => p.platform));
  const { data: channels } = await admin.from("content_channels").select("id, platform, is_disconnected").eq("workspace_id", ws.id).eq("enabled", true);
  const { data: internal } = await admin.from("content_job_internal").select("editor_ref").eq("job_id", job.id).maybeSingle();
  const bridgeCopy = ((internal?.editor_ref as { copy?: Record<string, PostCopy> } | null)?.copy) ?? {};
  const slots = await existingSlots(admin, ws.id);
  const rules = ws.approval_rules ?? {};
  const autoPost = job.auto_post ?? (rules.caption_approval === false && rules.final_post_approval === false);

  const platforms = (job.platforms.length ? job.platforms : ws.allowed_platforms).filter((p) => ws.allowed_platforms.includes(p));
  for (const platform of platforms as Platform[]) {
    if (have.has(platform)) continue;
    const channel = (channels ?? []).find((c) => c.platform === platform);
    const fromBridge = bridgeCopy[platform];
    const { copy, source } = fromBridge
      ? { copy: fromBridge, source: "bridge" as const }
      : await generateCopy({ platform, jobTitle: job.title, brand: ws.brand_profile ?? {}, workspaceName: ws.name, notes: job.client_notes });
    const at = resolvePostTime({
      rules: ws.schedule_rules ?? {},
      timezone: ws.timezone,
      platform,
      existing: slots,
      now: new Date(),
      timing: job.post_timing ?? ws.default_post_timing ?? "auto_slot",
      fixedAt: job.post_at ? new Date(job.post_at) : null,
      dailyTime: ws.default_post_time,
    });
    if (at) slots.push({ at, platform });
    const problems = copyProblems(platform, copy);
    await admin.from("content_posts").insert({
      job_id: job.id,
      workspace_id: ws.id,
      version_id: job.current_version_id,
      channel_id: channel?.id ?? null,
      platform,
      caption: copy.caption,
      title: copy.title,
      description: copy.description,
      hashtags: copy.hashtags,
      cta: copy.cta,
      caption_source: source,
      caption_approved: autoPost && !problems.length,
      scheduled_at: at?.toISOString() ?? null,
      slot_source: at ? (job.post_at ? "manual" : "auto") : null,
      status: autoPost && channel && at && !problems.length ? "approved" : "awaiting_approval",
      last_error: !channel ? `No ${platform} channel connected for ${ws.name}.` : problems[0] ?? (at ? null : "No free slot in the next 60 days."),
    });
  }
  if (!autoPost) {
    await notify(admin, { kind: "approval_needed", title: `${ws.name}: approve posts for ${job.title}`, workspaceId: ws.id, jobId: job.id, link: `/jobs/${job.id}#posts` });
  }
}

// ── Buffer: send approved posts, track state ──────────────────────────────

/**
 * Buffer key lookup: the client's own Buffer account (if they have one) → the agency Buffer account
 * connected in Settings (stored on the agency workspace) → BUFFER_API_KEY on the server.
 */
export async function agencyBufferKey(admin: AdminClient): Promise<string | null> {
  const { data: agency } = await admin.from("content_workspaces").select("id").eq("is_agency", true).maybeSingle();
  if (agency) {
    const { data } = await admin.from("content_secrets").select("value").eq("workspace_id", agency.id).eq("kind", "buffer_api_key").maybeSingle();
    if (data?.value) return data.value;
  }
  return process.env.BUFFER_API_KEY || null;
}

async function adapterFor(admin: AdminClient, workspaceId: string): Promise<PublishingAdapter | null> {
  const { data } = await admin.from("content_secrets").select("value").eq("workspace_id", workspaceId).eq("kind", "buffer_api_key").maybeSingle();
  const key = data?.value || (await agencyBufferKey(admin));
  return key ? new BufferAdapter(key) : null;
}

async function setIntegration(admin: AdminClient, kind: "buffer" | "editor" | "youtube" | "instagram", workspaceId: string | null, status: "ok" | "disconnected" | "error" | "degraded", detail: Record<string, unknown>) {
  const { data: current } = await admin.from("content_integrations").select("id, status").eq("kind", kind).filter("workspace_id", workspaceId ? "eq" : "is", workspaceId ?? null).maybeSingle();
  const row = { kind, workspace_id: workspaceId, status, detail, last_seen_at: status === "ok" ? new Date().toISOString() : undefined, updated_at: new Date().toISOString() };
  if (current) await admin.from("content_integrations").update(row).eq("id", current.id);
  else await admin.from("content_integrations").insert(row);
  if (current?.status === "ok" && status !== "ok") {
    await notify(admin, { kind: "integration_disconnected", title: `${kind === "buffer" ? "Buffer" : kind === "youtube" ? "YouTube" : kind === "instagram" ? "Instagram" : "Editor"} needs attention`, body: String(detail.message ?? ""), workspaceId, link: "/settings" });
  }
}

export async function sendPostToBuffer(admin: AdminClient, postId: string): Promise<void> {
  const { data: post } = await admin.from("content_posts").select("*, channel:content_channels(id, provider, name, buffer_channel_id, workspace_id, is_disconnected), version:content_versions(storage_path)").eq("id", postId).single();
  if (!post || post.status !== "approved" || post.buffer_post_id) return;
  if (post.channel?.provider === "youtube") return sendPostToYouTube(admin, post);
  if (post.channel?.provider === "instagram") return prepareInstagram(admin, post);
  const fail = async (message: string, retryable: boolean) => {
    await admin.from("content_posts").update({ status: retryable && post.attempts < 3 ? "approved" : "failed", last_error: message, attempts: post.attempts + 1 }).eq("id", post.id);
    if (!retryable || post.attempts >= 2) {
      await admin.from("content_jobs").update({ needs_attention: true, attention_reason: `Post failed: ${message}` }).eq("id", post.job_id);
      await notify(admin, { kind: "publish_failed", title: `Post failed (${post.platform})`, body: message, workspaceId: post.workspace_id, jobId: post.job_id, link: `/jobs/${post.job_id}#posts` });
    }
  };
  // Hard isolation check, again, right before anything leaves the system.
  if (!post.channel || post.channel.workspace_id !== post.workspace_id) return fail("Channel is not mapped to this workspace.", false);
  if (post.channel.is_disconnected) return fail("The channel is disconnected in Buffer.", false);
  if (!post.version?.storage_path) return fail("Final video is missing.", false);
  if (!post.scheduled_at) return fail("No posting time set.", false);
  if (new Date(post.scheduled_at).getTime() < Date.now() - 5 * 60000) return fail("Posting time is in the past. Pick a new time.", false);

  const adapter = await adapterFor(admin, post.workspace_id);
  if (!adapter) return fail("Buffer is not connected (no API key).", false);
  const videoUrl = await signedViewUrl(admin, post.version.storage_path, 7 * 24 * 3600);
  if (!videoUrl) return fail("Final video is missing from storage.", false);

  await admin.from("content_posts").update({ status: "publishing" }).eq("id", post.id).eq("status", "approved");
  try {
    const result = await adapter.createPost({
      channelId: post.channel.buffer_channel_id,
      platform: post.platform,
      text: composeText(post.platform, { caption: post.caption ?? "", hashtags: post.hashtags ?? [], cta: post.cta, title: post.title, description: post.description }),
      dueAt: new Date(post.scheduled_at),
      videoUrl,
      title: post.title,
    });
    await admin.from("content_posts").update({ status: "scheduled", buffer_post_id: result.id, buffer_status: result.status, last_error: null, attempts: post.attempts + 1 }).eq("id", post.id);
    await setIntegration(admin, "buffer", post.workspace_id, "ok", {});
  } catch (e) {
    const err = e as PublishingError;
    await admin.from("content_posts").update({ status: "approved" }).eq("id", post.id).eq("status", "publishing");
    if (err.kind === "auth") await setIntegration(admin, "buffer", post.workspace_id, "disconnected", { message: err.message });
    await fail(err.message, err.kind === "network" || err.kind === "rate_limit");
  }
}

export async function syncChannels(admin: AdminClient, workspaceId: string | null) {
  const key = workspaceId ? undefined : await agencyBufferKey(admin);
  const adapter = workspaceId ? await adapterFor(admin, workspaceId) : key ? new BufferAdapter(key) : null;
  if (!adapter) return { channels: [] as Awaited<ReturnType<PublishingAdapter["listChannels"]>> };
  const remote = await adapter.listChannels();
  for (const c of remote) {
    await admin.from("content_channels").update({ is_disconnected: c.isDisconnected, name: c.name, avatar_url: c.avatarUrl, synced_at: new Date().toISOString() }).eq("buffer_channel_id", c.id);
  }
  return { channels: remote.map((c) => ({ ...c, platform: platformFromService(c.platform) })) };
}

async function trackScheduled(admin: AdminClient) {
  const { data: posts } = await admin
    .from("content_posts")
    .select("id, job_id, workspace_id, platform, buffer_post_id, status, channel:content_channels(buffer_channel_id, buffer_org_id)")
    .in("status", ["scheduled", "publishing"])
    .not("buffer_post_id", "is", null)
    .lte("scheduled_at", new Date(Date.now() + 3600e3).toISOString())
    .limit(200);
  const groups = new Map<string, typeof posts>();
  for (const p of posts ?? []) {
    const ch = p.channel as unknown as { buffer_channel_id: string; buffer_org_id: string | null } | null;
    if (!ch?.buffer_org_id) continue;
    const key = `${p.workspace_id}|${ch.buffer_org_id}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  for (const [key, list] of groups) {
    const [workspaceId, orgId] = key.split("|");
    const adapter = await adapterFor(admin, workspaceId);
    if (!adapter || !list) continue;
    try {
      const channelIds = [...new Set(list.map((p) => (p.channel as unknown as { buffer_channel_id: string }).buffer_channel_id))];
      const states = new Map((await adapter.postStates(orgId, channelIds)).map((s) => [s.id, s]));
      for (const p of list) {
        const state = states.get(p.buffer_post_id as string);
        const mapped = state ? mapRemoteStatus(state.status) : null;
        if (!mapped || mapped === p.status) continue;
        await admin.from("content_posts").update({
          status: mapped,
          buffer_status: state!.status,
          published_at: mapped === "published" ? new Date().toISOString() : null,
          last_error: mapped === "failed" ? "Buffer reported a publishing error. Open Buffer for details, then retry." : null,
        }).eq("id", p.id);
        if (mapped === "failed") {
          await admin.from("content_jobs").update({ needs_attention: true, attention_reason: `Publishing failed on ${p.platform}.` }).eq("id", p.job_id);
          await notify(admin, { kind: "publish_failed", title: `Publishing failed (${p.platform})`, workspaceId: p.workspace_id, jobId: p.job_id, link: `/jobs/${p.job_id}#posts` });
        }
      }
    } catch (e) {
      console.error("buffer tracking failed", (e as Error).message);
    }
  }
}

// ── YouTube direct: upload approved posts, track them until they are live ──

type YouTubePost = {
  id: string; job_id: string; workspace_id: string; platform: Platform; status: string; attempts: number; scheduled_at: string | null;
  caption: string | null; hashtags: string[] | null; cta: string | null; title: string | null; description: string | null;
  channel: { id: string; name: string; workspace_id: string; is_disconnected: boolean } | null;
  version: { storage_path: string | null } | null;
};

async function youtubeToken(admin: AdminClient, channelId: string): Promise<{ client: YouTubeClient; accessToken: string } | { error: string; auth: boolean }> {
  const app = youtubeApp();
  if (!app) return { error: "YouTube isn't set up on the server (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).", auth: false };
  const { data } = await admin.from("content_channel_tokens").select("refresh_token").eq("channel_id", channelId).maybeSingle();
  if (!data?.refresh_token) return { error: "This YouTube channel isn't signed in. Connect it again on the client's Channels tab.", auth: true };
  const client = new YouTubeClient(app);
  try {
    return { client, accessToken: await client.accessToken(data.refresh_token) };
  } catch (e) {
    const err = e as PublishingError;
    return { error: err.message, auth: err.kind === "auth" };
  }
}

async function disconnectYouTube(admin: AdminClient, channelId: string, workspaceId: string, message: string) {
  await admin.from("content_channels").update({ is_disconnected: true }).eq("id", channelId);
  await setIntegration(admin, "youtube", workspaceId, "disconnected", { message });
}

async function sendPostToYouTube(admin: AdminClient, post: YouTubePost): Promise<void> {
  const fail = async (message: string, retryable: boolean) => {
    await admin.from("content_posts").update({ status: retryable && post.attempts < 3 ? "approved" : "failed", last_error: message, attempts: post.attempts + 1 }).eq("id", post.id);
    if (!retryable || post.attempts >= 2) {
      await admin.from("content_jobs").update({ needs_attention: true, attention_reason: `Post failed: ${message}` }).eq("id", post.job_id);
      await notify(admin, { kind: "publish_failed", title: "YouTube post failed", body: message, workspaceId: post.workspace_id, jobId: post.job_id, link: `/jobs/${post.job_id}#posts` });
    }
  };
  // Hard isolation check, again, right before anything leaves the system.
  if (!post.channel || post.channel.workspace_id !== post.workspace_id) return fail("Channel is not mapped to this workspace.", false);
  if (post.channel.is_disconnected) return fail("The YouTube channel is signed out. Connect it again on the client's Channels tab.", false);
  if (!post.version?.storage_path) return fail("Final video is missing.", false);
  if (!post.scheduled_at) return fail("No posting time set.", false);
  if (new Date(post.scheduled_at).getTime() < Date.now() - 5 * 60000) return fail("Posting time is in the past. Pick a new time.", false);

  const token = await youtubeToken(admin, post.channel.id);
  if ("error" in token) {
    if (token.auth) await disconnectYouTube(admin, post.channel.id, post.workspace_id, token.error);
    return fail(token.error, !token.auth);
  }
  const videoUrl = await signedViewUrl(admin, post.version.storage_path, 3600);
  if (!videoUrl) return fail("Final video is missing from storage.", false);

  // Claim the post so two passes running at once can never upload it twice.
  const { count } = await admin.from("content_posts").update({ status: "publishing" }, { count: "exact" }).eq("id", post.id).eq("status", "approved").is("buffer_post_id", null);
  if (!count) return;
  try {
    const source = await fetch(videoUrl);
    const copy = { caption: post.caption ?? "", hashtags: post.hashtags ?? [], cta: post.cta, title: post.title, description: post.description };
    const { videoId, scheduled } = await token.client.upload({
      accessToken: token.accessToken,
      source,
      title: post.title || (post.caption ?? "").split("\n")[0] || "New video",
      description: composeText("youtube", copy),
      tags: post.hashtags ?? [],
      dueAt: new Date(post.scheduled_at),
    });
    await admin.from("content_posts").update({
      status: scheduled ? "scheduled" : "published",
      buffer_post_id: youtubeVideoKey(videoId),
      buffer_status: scheduled ? "scheduled on YouTube" : "public",
      external_url: watchUrl(videoId),
      published_at: scheduled ? null : new Date().toISOString(),
      last_error: null,
      attempts: post.attempts + 1,
    }).eq("id", post.id);
    await setIntegration(admin, "youtube", post.workspace_id, "ok", {});
  } catch (e) {
    const err = e as PublishingError;
    await admin.from("content_posts").update({ status: "approved" }).eq("id", post.id).eq("status", "publishing");
    if (err.kind === "auth") await disconnectYouTube(admin, post.channel.id, post.workspace_id, err.message);
    await fail(err.message ?? String(e), err.kind === "network" || err.kind === "rate_limit" || !err.kind);
  }
}

async function trackYouTube(admin: AdminClient) {
  const { data: posts } = await admin
    .from("content_posts")
    .select("id, job_id, workspace_id, status, scheduled_at, buffer_post_id, buffer_status, channel_id")
    .eq("status", "scheduled")
    .like("buffer_post_id", "youtube:%")
    .lte("scheduled_at", new Date(Date.now() + 600e3).toISOString())
    .limit(200);
  const byChannel = new Map<string, NonNullable<typeof posts>>();
  for (const p of posts ?? []) if (p.channel_id) byChannel.set(p.channel_id, [...(byChannel.get(p.channel_id) ?? []), p]);
  for (const [channelId, list] of byChannel) {
    const token = await youtubeToken(admin, channelId);
    if ("error" in token) {
      if (token.auth) await disconnectYouTube(admin, channelId, list[0].workspace_id, token.error);
      continue;
    }
    try {
      const states = await token.client.videoStates(token.accessToken, list.map((p) => fromKey(p.buffer_post_id as string)!).filter(Boolean));
      for (const p of list) {
        const state = states.get(fromKey(p.buffer_post_id as string)!);
        const mapped = mapYouTubeState(state, new Date(p.scheduled_at as string));
        if (!mapped) continue;
        if (mapped === "published") {
          await admin.from("content_posts").update({ status: "published", buffer_status: state!.privacyStatus, published_at: new Date().toISOString(), last_error: null }).eq("id", p.id);
          continue;
        }
        if (mapped === "stuck_private") {
          // The video is on YouTube, just private: keep watching (so it flips to Published once someone makes it
          // public in YouTube Studio) and warn once. Never re-upload, that would make a duplicate.
          if (p.buffer_status === "kept private") continue;
          const note = "YouTube kept this video private. Uploads from a Google project that has not passed the YouTube API audit stay private: make it public in YouTube Studio (docs/YOUTUBE.md has the audit steps).";
          await admin.from("content_posts").update({ buffer_status: "kept private", last_error: note }).eq("id", p.id);
          await admin.from("content_jobs").update({ needs_attention: true, attention_reason: note }).eq("id", p.job_id);
          await notify(admin, { kind: "publish_failed", title: "YouTube kept a video private", body: note, workspaceId: p.workspace_id, jobId: p.job_id, link: `/jobs/${p.job_id}#posts` });
          continue;
        }
        const message = `YouTube ${state ? `marked the upload ${state.uploadStatus}${state.reason ? ` (${state.reason})` : ""}` : "no longer has this video"}.`;
        await admin.from("content_posts").update({ status: "failed", buffer_status: state?.uploadStatus ?? "deleted", last_error: message }).eq("id", p.id);
        await admin.from("content_jobs").update({ needs_attention: true, attention_reason: message }).eq("id", p.job_id);
        await notify(admin, { kind: "publish_failed", title: "YouTube needs a look", body: message, workspaceId: p.workspace_id, jobId: p.job_id, link: `/jobs/${p.job_id}#posts` });
      }
    } catch (e) {
      console.error("youtube tracking failed", (e as Error).message);
    }
  }
}

// ── Instagram direct: hand Instagram the Reel shortly before its time, publish it at the time ──

async function instagramToken(admin: AdminClient, channelId: string): Promise<{ client: InstagramClient; token: string } | { error: string; auth: boolean }> {
  const app = instagramApp();
  if (!app) return { error: "Instagram isn't set up on the server (INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET).", auth: false };
  const { data } = await admin.from("content_channel_tokens").select("refresh_token, updated_at, expires_at").eq("channel_id", channelId).maybeSingle();
  if (!data?.refresh_token) return { error: "This Instagram account isn't signed in. Connect it again on the client's Channels tab.", auth: true };
  const client = new InstagramClient(app);
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return { error: "The Instagram sign-in ran out (60 days). Connect the account again.", auth: true };
  if (needsRefresh(data.updated_at, data.expires_at)) {
    try {
      const fresh = await client.refresh(data.refresh_token);
      await admin.from("content_channel_tokens").update({ refresh_token: fresh.token, expires_at: fresh.expiresAt, updated_at: new Date().toISOString() }).eq("channel_id", channelId);
      return { client, token: fresh.token };
    } catch (e) {
      const err = e as PublishingError;
      if (err.kind === "auth") return { error: err.message, auth: true };
      // A failed refresh isn't fatal while the old token still works.
    }
  }
  return { client, token: data.refresh_token };
}

async function disconnectInstagram(admin: AdminClient, channelId: string, workspaceId: string, message: string) {
  await admin.from("content_channels").update({ is_disconnected: true }).eq("id", channelId);
  await setIntegration(admin, "instagram", workspaceId, "disconnected", { message });
}

async function failInstagram(admin: AdminClient, post: { id: string; job_id: string; workspace_id: string; attempts: number }, message: string, retryable: boolean) {
  const retry = retryable && post.attempts < 3;
  await admin.from("content_posts").update({ status: retry ? "approved" : "failed", buffer_post_id: null, buffer_status: null, last_error: message, attempts: post.attempts + 1 }).eq("id", post.id);
  if (!retry) {
    await admin.from("content_jobs").update({ needs_attention: true, attention_reason: `Post failed: ${message}` }).eq("id", post.job_id);
    await notify(admin, { kind: "publish_failed", title: "Instagram post failed", body: message, workspaceId: post.workspace_id, jobId: post.job_id, link: `/jobs/${post.job_id}#posts` });
  }
}

type InstagramPost = YouTubePost & { channel: (YouTubePost["channel"] & { buffer_channel_id: string }) | null };

async function prepareInstagram(admin: AdminClient, post: InstagramPost): Promise<void> {
  if (!post.scheduled_at) return failInstagram(admin, post, "No posting time set.", false);
  const due = new Date(post.scheduled_at).getTime();
  if (due - Date.now() > PREPARE_AHEAD_MS) return; // not yet: Instagram can't hold a post for later
  if (due < Date.now() - 30 * 60000) return failInstagram(admin, post, "The posting time passed while the app couldn't post. Pick a new time.", false);
  // Hard isolation check, again, right before anything leaves the system.
  if (!post.channel || post.channel.workspace_id !== post.workspace_id) return failInstagram(admin, post, "Channel is not mapped to this workspace.", false);
  if (post.channel.is_disconnected) return failInstagram(admin, post, "The Instagram account is signed out. Connect it again on the client's Channels tab.", false);
  const igUser = userIdFromChannelKey(post.channel.buffer_channel_id);
  if (!igUser) return failInstagram(admin, post, "Channel is not an Instagram account.", false);
  if (!post.version?.storage_path) return failInstagram(admin, post, "Final video is missing.", false);

  const auth = await instagramToken(admin, post.channel.id);
  if ("error" in auth) {
    if (auth.auth) await disconnectInstagram(admin, post.channel.id, post.workspace_id, auth.error);
    return failInstagram(admin, post, auth.error, !auth.auth);
  }
  // Instagram fetches the file itself, so the link has to stay valid while it processes.
  const videoUrl = await signedViewUrl(admin, post.version.storage_path, 6 * 3600);
  if (!videoUrl) return failInstagram(admin, post, "Final video is missing from storage.", false);

  // Claim the post so two passes running at once can never upload it twice.
  const { count } = await admin.from("content_posts").update({ status: "publishing" }, { count: "exact" }).eq("id", post.id).eq("status", "approved").is("buffer_post_id", null);
  if (!count) return;
  try {
    const copy = { caption: post.caption ?? "", hashtags: post.hashtags ?? [], cta: post.cta, title: post.title, description: post.description };
    const container = await auth.client.createReel(auth.token, igUser, { videoUrl, caption: composeText("instagram", copy) });
    await admin.from("content_posts").update({ status: "scheduled", buffer_post_id: containerKey(container), buffer_status: "processing", last_error: null }).eq("id", post.id);
    await setIntegration(admin, "instagram", post.workspace_id, "ok", {});
  } catch (e) {
    const err = e as PublishingError;
    await admin.from("content_posts").update({ status: "approved" }).eq("id", post.id).eq("status", "publishing");
    if (err.kind === "auth") await disconnectInstagram(admin, post.channel.id, post.workspace_id, err.message);
    await failInstagram(admin, post, err.message ?? String(e), err.kind === "network" || err.kind === "rate_limit" || !err.kind);
  }
}

async function trackInstagram(admin: AdminClient) {
  const { data: posts } = await admin
    .from("content_posts")
    .select("id, job_id, workspace_id, attempts, scheduled_at, updated_at, buffer_post_id, buffer_status, channel:content_channels(id, buffer_channel_id)")
    .eq("status", "scheduled")
    .like("buffer_post_id", "igc:%")
    .limit(100);
  const tokens = new Map<string, Awaited<ReturnType<typeof instagramToken>>>();
  for (const p of posts ?? []) {
    const ch = p.channel as unknown as { id: string; buffer_channel_id: string } | null;
    const igUser = ch ? userIdFromChannelKey(ch.buffer_channel_id) : null;
    const container = containerFromKey(p.buffer_post_id as string);
    if (!ch || !igUser || !container) continue;
    if (!tokens.has(ch.id)) tokens.set(ch.id, await instagramToken(admin, ch.id));
    const auth = tokens.get(ch.id)!;
    if ("error" in auth) {
      if (auth.auth) await disconnectInstagram(admin, ch.id, p.workspace_id, auth.error);
      continue;
    }
    try {
      const { status, detail } = await auth.client.containerStatus(auth.token, container);
      const step = nextContainerStep(status, new Date(p.scheduled_at as string), new Date(p.updated_at as string));
      if (step === "wait") continue;
      if (step === "retry") {
        await failInstagram(admin, p, status === "EXPIRED" ? "Instagram dropped the upload before it could be posted." : `Instagram couldn't process the video${detail ? ` (${detail})` : ""}. Check it's an MP4 (H.264, AAC), 3 s to 15 min, under 300 MB.`, status !== "ERROR");
        continue;
      }
      if (step === "already") {
        await admin.from("content_posts").update({ status: "published", buffer_status: "published", published_at: new Date().toISOString(), last_error: null }).eq("id", p.id);
        continue;
      }
      // Claim the publish: two passes at once must never post it twice.
      const { count } = await admin.from("content_posts").update({ buffer_status: "publishing" }, { count: "exact" }).eq("id", p.id).eq("buffer_status", p.buffer_status ?? "processing").neq("buffer_status", "publishing");
      if (!count) continue;
      try {
        const { mediaId, permalink } = await auth.client.publish(auth.token, igUser, container);
        await admin.from("content_posts").update({ status: "published", buffer_post_id: mediaKey(mediaId), buffer_status: "published", external_url: permalink, published_at: new Date().toISOString(), last_error: null }).eq("id", p.id);
      } catch (e) {
        const err = e as PublishingError;
        await admin.from("content_posts").update({ buffer_status: "ready", last_error: err.message }).eq("id", p.id);
        if (err.kind === "auth") await disconnectInstagram(admin, ch.id, p.workspace_id, err.message);
        else if (err.kind === "invalid") await failInstagram(admin, p, err.message, false);
      }
    } catch (e) {
      console.error("instagram tracking failed", (e as Error).message);
    }
  }
}

/** Job status follows its posts: any scheduled → Scheduled; all live → Published. */
async function rollUpJobs(admin: AdminClient) {
  const { data: jobs } = await admin.from("content_jobs").select("*").in("status", ["approved", "scheduled", "publishing"]).limit(200);
  for (const job of (jobs ?? []) as Job[]) {
    const { data: posts } = await admin.from("content_posts").select("status").eq("job_id", job.id).neq("status", "cancelled");
    const s = (posts ?? []).map((p) => p.status);
    if (!s.length) continue;
    let to: JobStatus | null = null;
    if (s.every((x) => x === "published")) to = "published";
    else if (s.some((x) => x === "publishing")) to = "publishing";
    else if (s.some((x) => x === "scheduled" || x === "published")) to = "scheduled";
    if (to && to !== job.status) {
      try {
        await setStatus(admin, job, to, to === "published" ? { published_at: new Date().toISOString() } : {});
        if (to === "published") await notify(admin, { kind: "published", title: `Published: ${job.title}`, workspaceId: job.workspace_id, jobId: job.id, link: `/jobs/${job.id}` });
      } catch {
        // Moved by someone else this tick; next tick re-evaluates.
      }
    }
  }
}

async function checkEditorHeartbeat(admin: AdminClient) {
  const { data } = await admin.from("content_integrations").select("id, status, last_seen_at").eq("kind", "editor").is("workspace_id", null).maybeSingle();
  if (!data?.last_seen_at) return;
  const stale = Date.now() - new Date(data.last_seen_at).getTime() > 45 * 60000;
  if (stale && data.status === "ok") await setIntegration(admin, "editor", null, "disconnected", { message: "The editing PC has not checked in for 45 minutes. Is it on, with Google Drive running?" });
}

/** One pass of every background step. Idempotent; safe to run every few minutes and on demand. */
export async function tick(admin: AdminClient) {
  const report: Record<string, number | string> = {};
  // 1. Incoming jobs (client portal uploads) get their intake decision.
  const { data: incoming } = await admin.from("content_jobs").select("id").eq("status", "incoming").lte("created_at", new Date(Date.now() - 60e3).toISOString()).limit(20);
  for (const j of incoming ?? []) await intakeJob(admin, j.id).catch((e) => console.error("intake", e.message));
  report.intake = incoming?.length ?? 0;

  // 2. New versions from the editor are routed.
  const { data: unrouted } = await admin.from("content_jobs").select("*").eq("status", "review").is("review_stage", null).limit(20);
  for (const job of (unrouted ?? []) as Job[]) await routeReview(admin, job, await loadWorkspace(admin, job.workspace_id)).catch((e) => console.error("route", e.message));
  report.routed = unrouted?.length ?? 0;

  // 2b. Jobs approved outside the app's own approve step (client approval in the portal) get their posts planned.
  const { data: approvedJobs } = await admin.from("content_jobs").select("*").eq("status", "approved").gte("approved_at", new Date(Date.now() - 7 * 86400e3).toISOString()).limit(20);
  let planned = 0;
  for (const job of (approvedJobs ?? []) as Job[]) {
    const { count } = await admin.from("content_posts").select("id", { count: "exact", head: true }).eq("job_id", job.id);
    if (!count) {
      await planPosts(admin, job).catch((e) => console.error("plan", e.message));
      planned++;
    }
  }
  report.planned = planned;

  // 3. Approved posts go to Buffer, or straight to YouTube for direct YouTube channels.
  // Soonest first: Instagram posts wait here (approved) until shortly before their time.
  const { data: ready } = await admin.from("content_posts").select("id").eq("status", "approved").is("buffer_post_id", null).eq("caption_approved", true).order("scheduled_at", { ascending: true }).limit(30);
  for (const p of ready ?? []) await sendPostToBuffer(admin, p.id).catch((e) => console.error("send", e.message));
  report.sent = ready?.length ?? 0;

  await trackScheduled(admin);
  await trackYouTube(admin);
  await trackInstagram(admin);
  await rollUpJobs(admin);
  await checkEditorHeartbeat(admin);
  return report;
}
