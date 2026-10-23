"use server";

import { AGENCY_NAME } from "@/lib/brand";
import { revalidatePath } from "next/cache";
import { getStaffClient, cleanError } from "@/lib/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { agencyPass, approveForEditing, approveJob, existingSlots, planPosts, requestChanges, sendPostToBuffer, loadJob } from "@/lib/workflow";
import { audit } from "@/lib/integrations/notify";
import { generateCopy } from "@/lib/integrations/captions";
import { normalizeHashtags } from "@/lib/domain/captions";
import { slotWarnings } from "@/lib/domain/schedule";
import { zonedTimeToUtc } from "@/lib/domain/schedule";
import { PLATFORMS, type Platform } from "@/lib/domain/types";
import type { ActionState } from "@/lib/forms";

const UUID = /^[0-9a-f-]{36}$/i;

/** Every job action proves the job is visible to this staff user through RLS first. */
async function staffJob(formData: FormData) {
  const ctx = await getStaffClient();
  if ("error" in ctx) return ctx;
  const id = String(formData.get("job") ?? "");
  if (!UUID.test(id)) return { error: "Unknown video." };
  const { data } = await ctx.supabase.from("content_jobs").select("id, workspace_id, title").eq("id", id).maybeSingle();
  if (!data) return { error: "Video not found." };
  return { ...ctx, job: data, admin: createAdminClient(), actor: { id: ctx.userId, label: ctx.role } };
}

function refresh(id: string, msg: string): ActionState {
  revalidatePath(`/jobs/${id}`);
  revalidatePath("/inbox");
  revalidatePath("/");
  revalidatePath("/calendar");
  return { success: msg };
}

export async function decide(_: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await staffJob(formData);
  if ("error" in ctx) return ctx;
  const decision = String(formData.get("decision"));
  const note = String(formData.get("note") ?? "").trim() || null;
  try {
    if (decision === "approve") {
      const r = await agencyPass(ctx.admin, ctx.job.id, ctx.actor);
      return refresh(ctx.job.id, r === "client" ? "Sent to the client for approval." : "Approved. Posts are being planned.");
    }
    if (decision === "approve_final") {
      await approveJob(ctx.admin, ctx.job.id, ctx.actor, { auto: false });
      return refresh(ctx.job.id, "Approved.");
    }
    if (decision === "changes_requested" || decision === "rerecord" || decision === "rejected") {
      if (decision === "changes_requested" && note) {
        const job = await loadJob(ctx.admin, ctx.job.id);
        await ctx.admin.from("content_feedback").insert({ job_id: job.id, version_id: job.current_version_id, workspace_id: job.workspace_id, author_id: ctx.userId, author_label: AGENCY_NAME, body: note });
      }
      await requestChanges(ctx.admin, ctx.job.id, ctx.actor, { decision, note: decision === "changes_requested" ? null : note, isOwner: ctx.role === "owner", allowOverage: formData.get("overage") === "on" });
      return refresh(ctx.job.id, decision === "changes_requested" ? "Changes sent to the editor." : decision === "rerecord" ? "Re-record requested." : "Rejected and archived.");
    }
    return { error: "Unknown decision." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Timestamped or general note on the current version (internal = never shown to the client). */
export async function addFeedback(_: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await staffJob(formData);
  if ("error" in ctx) return ctx;
  const body = String(formData.get("body") ?? "").trim();
  const at = formData.get("at") ? Number(formData.get("at")) : null;
  const url = String(formData.get("url") ?? "").trim() || null;
  if (!body && !url) return { error: "Write a note first." };
  if (url && !/^https?:\/\//i.test(url)) return { error: "Links must start with http:// or https://" };
  const version = String(formData.get("version") ?? "");
  const { error } = await ctx.supabase.from("content_feedback").insert({
    job_id: ctx.job.id,
    workspace_id: ctx.job.workspace_id,
    version_id: UUID.test(version) ? version : null,
    author_id: ctx.userId,
    author_label: AGENCY_NAME,
    body: body || "Reference",
    at_seconds: at !== null && Number.isFinite(at) ? Math.max(0, at) : null,
    reference_url: url,
    internal: formData.get("internal") === "on",
  });
  if (error) return { error: cleanError(error.message) };
  return refresh(ctx.job.id, "Note added.");
}

export async function updateJob(_: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await staffJob(formData);
  if ("error" in ctx) return ctx;
  const platforms = formData.getAll("platforms").map(String).filter((p) => (PLATFORMS as readonly string[]).includes(p));
  const autoPost = String(formData.get("auto_post") ?? "inherit");
  const patch = {
    title: String(formData.get("title") ?? "").trim().slice(0, 160) || ctx.job.title,
    form: formData.get("form") === "long" ? "long" : "short",
    platforms,
    priority: ["low", "normal", "high", "urgent"].includes(String(formData.get("priority"))) ? String(formData.get("priority")) : "normal",
    due_date: String(formData.get("due_date") ?? "") || null,
    category: String(formData.get("category") ?? "").trim() || null,
    auto_post: autoPost === "on" ? true : autoPost === "off" ? false : null,
    needs_attention: formData.get("needs_attention") === "on",
    attention_reason: formData.get("needs_attention") === "on" ? "Marked for manual review." : null,
  };
  const { error } = await ctx.supabase.from("content_jobs").update(patch).eq("id", ctx.job.id);
  if (error) return { error: cleanError(error.message) };
  const notes = String(formData.get("agency_notes") ?? "");
  await ctx.supabase.from("content_job_internal").upsert({ job_id: ctx.job.id, workspace_id: ctx.job.workspace_id, agency_notes: notes || null }, { onConflict: "job_id" });
  return refresh(ctx.job.id, "Saved.");
}

export async function jobStatusAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await staffJob(formData);
  if ("error" in ctx) return ctx;
  const what = String(formData.get("what"));
  try {
    if (what === "start" || what === "retry") {
      if (what === "retry") {
        // Clear the bridge mapping so the editor gets a clean drop.
        await ctx.admin.from("content_job_internal").update({ editor_ref: {}, last_error: null }).eq("job_id", ctx.job.id);
      }
      await approveForEditing(ctx.admin, ctx.job.id, ctx.actor, { allowOverage: formData.get("overage") === "on", isOwner: ctx.role === "owner" });
      return refresh(ctx.job.id, "Sent to the editor.");
    }
    if (what === "archive") {
      await ctx.supabase.from("content_jobs").update({ status: "archived" }).eq("id", ctx.job.id);
      return refresh(ctx.job.id, "Archived.");
    }
    if (what === "restore") {
      await ctx.supabase.from("content_jobs").update({ status: "pending_approval" }).eq("id", ctx.job.id).eq("status", "archived");
      return refresh(ctx.job.id, "Restored to Waiting to edit.");
    }
    if (what === "plan_posts") {
      await planPosts(ctx.admin, await loadJob(ctx.admin, ctx.job.id));
      return refresh(ctx.job.id, "Posts planned.");
    }
    if (what === "resolve") {
      await ctx.supabase.from("content_jobs").update({ needs_attention: false, attention_reason: null }).eq("id", ctx.job.id);
      return refresh(ctx.job.id, "Marked as handled.");
    }
    return { error: "Unknown action." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ── Posts ─────────────────────────────────────────────────────────────────

async function staffPost(formData: FormData) {
  const ctx = await getStaffClient();
  if ("error" in ctx) return ctx;
  const id = String(formData.get("post") ?? "");
  if (!UUID.test(id)) return { error: "Unknown post." };
  const { data } = await ctx.supabase.from("content_posts").select("*, workspace:content_workspaces(timezone, schedule_rules, name, brand_profile)").eq("id", id).maybeSingle();
  if (!data) return { error: "Post not found." };
  return { ...ctx, post: data, admin: createAdminClient() };
}

export async function savePost(_: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await staffPost(formData);
  if ("error" in ctx) return ctx;
  const p = ctx.post;
  if (p.buffer_post_id && p.status !== "failed") return { error: "Already sent to Buffer. Change it in Buffer, or cancel and re-plan." };
  const ws = p.workspace as { timezone: string; schedule_rules: Record<string, unknown> } | null;
  const tz = ws?.timezone ?? "America/New_York";
  const when = String(formData.get("when") ?? "");
  let scheduledAt: string | null = p.scheduled_at;
  if (when) {
    const [d, t] = when.split("T");
    scheduledAt = zonedTimeToUtc(d, t.slice(0, 5), tz).toISOString();
  }
  const channel = String(formData.get("channel") ?? "");
  const intent = String(formData.get("intent") ?? "save");
  if (formData.get("keep_copy")) {
    // Calendar quick reschedule: only the time changes.
    const { error } = await ctx.supabase.from("content_posts").update({ scheduled_at: scheduledAt, slot_source: "manual" }).eq("id", p.id);
    if (error) return { error: cleanError(error.message) };
    const warnings = scheduledAt ? slotWarnings({ rules: ws?.schedule_rules ?? {}, timezone: tz, platform: p.platform as Platform, existing: await existingSlots(ctx.admin, p.workspace_id, p.id) }, new Date(scheduledAt)) : [];
    revalidatePath("/calendar");
    revalidatePath(`/jobs/${p.job_id}`);
    return { success: warnings.length ? `Moved. Note: ${warnings.join(" ")}` : "Moved." };
  }
  const patch: Record<string, unknown> = {
    caption: String(formData.get("caption") ?? ""),
    hashtags: normalizeHashtags(String(formData.get("hashtags") ?? "")),
    cta: String(formData.get("cta") ?? "").trim() || null,
    title: String(formData.get("title") ?? "").trim() || null,
    description: String(formData.get("description") ?? "").trim() || null,
    scheduled_at: scheduledAt,
    slot_source: when && scheduledAt !== p.scheduled_at ? "manual" : p.slot_source,
    channel_id: UUID.test(channel) ? channel : p.channel_id,
    caption_source: "manual",
  };
  if (intent === "approve") Object.assign(patch, { caption_approved: true, status: "approved", last_error: null, attempts: 0, buffer_post_id: null });
  if (intent === "hold") Object.assign(patch, { status: "awaiting_approval", caption_approved: false });
  if (intent === "cancel") Object.assign(patch, { status: "cancelled" });
  const { error } = await ctx.supabase.from("content_posts").update(patch).eq("id", p.id);
  if (error) return { error: cleanError(error.message) };
  if (intent === "approve") {
    await audit(ctx.admin, { workspaceId: p.workspace_id, actorId: ctx.userId, actorLabel: ctx.role, action: "post_approved", entity: "post", entityId: p.id });
    await sendPostToBuffer(ctx.admin, p.id);
    const { data: after } = await ctx.admin.from("content_posts").select("status, last_error").eq("id", p.id).single();
    revalidatePath(`/jobs/${p.job_id}`);
    revalidatePath("/calendar");
    if (after?.status === "scheduled") return { success: "Scheduled in Buffer." };
    return { error: after?.last_error ?? "Saved, but Buffer did not accept it yet." };
  }
  const warnings = scheduledAt ? slotWarnings({ rules: ws?.schedule_rules ?? {}, timezone: tz, platform: p.platform as Platform, existing: await existingSlots(ctx.admin, p.workspace_id, p.id) }, new Date(scheduledAt)) : [];
  revalidatePath(`/jobs/${p.job_id}`);
  revalidatePath("/calendar");
  return { success: warnings.length ? `Saved. Note: ${warnings.join(" ")}` : intent === "cancel" ? "Post cancelled." : "Saved." };
}

export async function regenerateCaption(_: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await staffPost(formData);
  if ("error" in ctx) return ctx;
  const p = ctx.post;
  const ws = p.workspace as { name: string; brand_profile: Record<string, string> } | null;
  const { data: job } = await ctx.supabase.from("content_jobs").select("title, client_notes").eq("id", p.job_id).single();
  const { copy, source } = await generateCopy({ platform: p.platform as Platform, jobTitle: job?.title ?? "", brand: ws?.brand_profile ?? {}, workspaceName: ws?.name ?? "", notes: job?.client_notes });
  await ctx.supabase.from("content_posts").update({ caption: copy.caption, hashtags: copy.hashtags, cta: copy.cta, title: copy.title, description: copy.description, caption_source: source }).eq("id", p.id);
  revalidatePath(`/jobs/${p.job_id}`);
  return { success: source === "server" ? "New caption written." : "No AI key on the server: template caption applied. Captions from the editing PC arrive with each edit." };
}
