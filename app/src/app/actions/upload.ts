"use server";

import { AGENCY_NAME } from "@/lib/brand";
import { revalidatePath } from "next/cache";
import { getUserClient, cleanError } from "@/lib/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { paths, signedUploadUrl, objectExists, assertPathInWorkspace } from "@/lib/integrations/storage";
import { intakeJob } from "@/lib/workflow";
import { MEDIA_KINDS, PLATFORMS, type MediaKind, type PostTiming, type StyleChoices } from "@/lib/domain/types";

/**
 * Two-step upload so large phone videos never pass through the Worker:
 *   1. prepareUpload  — permission check, rows created, one signed upload URL per file
 *   2. (browser PUTs each file straight to Supabase Storage, with progress)
 *   3. completeUpload — verifies every object really arrived, then runs the intake rules
 * Several files can belong to ONE intended video: they share a job and an upload_group.
 */

export type UploadFileSpec = { name: string; size: number; type: string; kind: MediaKind; role: "primary" | "source" | "reference"; duration?: number | null };
export type UploadSpec = {
  workspaceId: string;
  mode: "job" | "loose"; // loose = straight to the inbox, grouped later
  job?: {
    title: string;
    form: "short" | "long";
    platforms: string[];
    notes?: string;
    priority?: string;
    dueDate?: string | null;
    requireReview?: boolean;
    styleChoices?: StyleChoices;
    scriptId?: string | null;
    postTiming?: PostTiming | null;
    postAt?: string | null; // ISO
  };
  files: UploadFileSpec[];
  links: string[];
  note?: string;
  existingJobId?: string | null; // add footage / B-roll / references to an existing job
  presetId?: string | null; // reference files for a style preset (staff only)
};

export type PreparedUpload = { error?: string; jobId?: string | null; group?: string; uploads?: { mediaId: string; url: string; path: string }[] };

const MAX_FILES = 40;
const LINK_RE = /^https?:\/\/[^\s]+$/i;

async function authorize(workspaceId: string) {
  const ctx = await getUserClient();
  if ("error" in ctx) return ctx;
  const [{ data: staff }, { data: can }] = await Promise.all([
    ctx.supabase.from("content_staff").select("role").eq("user_id", ctx.userId).maybeSingle(),
    ctx.supabase.rpc("content_can", { p_workspace: workspaceId, p_perm: "can_upload" }),
  ]);
  if (!staff && can !== true) return { error: "You cannot upload to this workspace." };
  return { ...ctx, isStaff: Boolean(staff) };
}

export async function prepareUpload(spec: UploadSpec): Promise<PreparedUpload> {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(spec.workspaceId)) return { error: "Choose a client first." };
    const auth = await authorize(spec.workspaceId);
    if ("error" in auth) return { error: auth.error };
    const files = spec.files.slice(0, MAX_FILES).filter((f) => MEDIA_KINDS.includes(f.kind) && f.size > 0);
    const links = spec.links.map((l) => l.trim()).filter((l) => LINK_RE.test(l)).slice(0, 20);
    const note = spec.note?.trim().slice(0, 4000) || "";
    if (!files.length && !links.length && !note) return { error: "Add at least one file, link or note." };

    const admin = createAdminClient();
    let jobId: string | null = null;

    let presetId: string | null = null;
    if (spec.presetId) {
      if (!auth.isStaff) return { error: `Only ${AGENCY_NAME} manages styles.` };
      const { data: preset } = await auth.supabase.from("content_style_presets").select("id, workspace_id").eq("id", spec.presetId).maybeSingle();
      if (!preset || preset.workspace_id !== spec.workspaceId) return { error: "Style not found." };
      presetId = preset.id;
    }

    // Style picks and script must belong to this workspace (read through RLS).
    const choices: StyleChoices = {};
    if (spec.job?.styleChoices) {
      const ids = (["captions", "sound", "edit"] as const).map((k) => spec.job!.styleChoices![k]).filter((v): v is string => Boolean(v && v !== "auto"));
      const { data: presets } = ids.length ? await auth.supabase.from("content_style_presets").select("id, kind").in("id", ids).eq("workspace_id", spec.workspaceId) : { data: [] };
      for (const k of ["captions", "sound", "edit"] as const) {
        const v = spec.job.styleChoices[k];
        if (v === "auto") choices[k] = "auto";
        else if (v && (presets ?? []).some((p) => p.id === v && p.kind === k)) choices[k] = v;
      }
      if (spec.job.styleChoices.notes) choices.notes = spec.job.styleChoices.notes.slice(0, 1000);
      const wanted = (spec.job.styleChoices.materials ?? []).filter((m) => /^[0-9a-f-]{36}$/i.test(m)).slice(0, 30);
      if (wanted.length && auth.isStaff) {
        const { data: items } = await auth.supabase.from("content_library").select("id, workspace_id").in("id", wanted).is("archived_at", null);
        choices.materials = (items ?? []).filter((i) => !i.workspace_id || i.workspace_id === spec.workspaceId).map((i) => i.id);
      }
    }
    let scriptId: string | null = null;
    if (spec.job?.scriptId) {
      const { data: script } = await auth.supabase.from("content_script_ideas").select("id, workspace_id").eq("id", spec.job.scriptId).maybeSingle();
      if (script?.workspace_id === spec.workspaceId) scriptId = script.id;
    }
    const timing = auth.isStaff && ["auto_slot", "after_edit", "fixed"].includes(spec.job?.postTiming ?? "") ? spec.job!.postTiming! : null;
    const postAt = timing === "fixed" && spec.job?.postAt && !Number.isNaN(Date.parse(spec.job.postAt)) ? new Date(spec.job.postAt).toISOString() : null;

    if (spec.existingJobId) {
      // Adding to an existing job: it must be in the same workspace and visible to this user.
      const { data: job } = await auth.supabase.from("content_jobs").select("id, workspace_id").eq("id", spec.existingJobId).maybeSingle();
      if (!job || job.workspace_id !== spec.workspaceId) {
        // Clients may not see every job; allow adding only to their own submissions or via staff.
        if (!auth.isStaff) return { error: "That video was not found." };
        return { error: "That video belongs to another client." };
      }
      jobId = job.id;
    } else if (spec.mode === "job") {
      const title = spec.job?.title?.trim() || files.find((f) => f.kind === "video")?.name.replace(/\.[^.]+$/, "") || "Untitled video";
      const platforms = (spec.job?.platforms ?? []).filter((p) => (PLATFORMS as readonly string[]).includes(p));
      const { data: job, error } = await admin
        .from("content_jobs")
        .insert({
          workspace_id: spec.workspaceId,
          title: title.slice(0, 160),
          form: spec.job?.form === "long" ? "long" : "short",
          platforms,
          status: "incoming",
          priority: auth.isStaff && ["low", "normal", "high", "urgent"].includes(spec.job?.priority ?? "") ? spec.job!.priority : "normal",
          due_date: auth.isStaff && spec.job?.dueDate ? spec.job.dueDate : null,
          client_notes: auth.isStaff ? null : note || null,
          source: auth.isStaff ? "agency" : "client",
          created_by: auth.userId,
          needs_attention: Boolean(spec.job?.requireReview),
          attention_reason: spec.job?.requireReview ? "Marked for manual review." : null,
          style_choices: choices,
          script_id: scriptId,
          post_timing: timing,
          post_at: postAt,
          auto_post: spec.job?.requireReview ? false : null,
        })
        .select("id")
        .single();
      if (error || !job) return { error: cleanError(error?.message) };
      jobId = job.id;
      if (scriptId) await admin.from("content_script_ideas").update({ status: "recorded", job_id: job.id }).eq("id", scriptId);
      if (auth.isStaff && note) await admin.from("content_job_internal").insert({ job_id: job.id, workspace_id: spec.workspaceId, agency_notes: note });
    }

    const group = crypto.randomUUID();
    const hasPrimary = files.some((f) => f.role === "primary");
    const uploads: NonNullable<PreparedUpload["uploads"]> = [];
    let primaryAssigned = hasPrimary;
    for (const f of files) {
      const mediaId = crypto.randomUUID();
      const path = paths.media(spec.workspaceId, mediaId, f.name);
      const role = f.role === "primary" || (!primaryAssigned && f.kind === "video" && jobId && !spec.existingJobId) ? "primary" : f.role;
      if (role === "primary") primaryAssigned = true;
      const { error } = await admin.from("content_media").insert({
        id: mediaId,
        workspace_id: spec.workspaceId,
        job_id: jobId,
        kind: f.kind,
        preset_id: presetId,
        role: f.kind.startsWith("reference") || presetId ? "reference" : role,
        review_status: presetId ? "reference_only" : jobId ? "accepted" : "incoming",
        storage_path: path,
        file_name: f.name.slice(0, 200),
        mime_type: f.type || null,
        size_bytes: f.size,
        duration_seconds: f.duration ?? null,
        upload_group: group,
        uploaded_by: auth.userId,
      });
      if (error) return { error: cleanError(error.message) };
      const signed = await signedUploadUrl(admin, path);
      uploads.push({ mediaId, url: signed.url, path });
    }
    for (const url of links) {
      await admin.from("content_media").insert({ workspace_id: spec.workspaceId, job_id: jobId, preset_id: presetId, kind: "link", role: "reference", review_status: presetId ? "reference_only" : jobId ? "accepted" : "incoming", url, upload_group: group, uploaded_by: auth.userId });
    }
    if (note && !presetId && (!jobId || !auth.isStaff)) {
      await admin.from("content_media").insert({ workspace_id: spec.workspaceId, job_id: jobId, kind: "note", role: "reference", review_status: jobId ? "accepted" : "incoming", body: note, upload_group: group, uploaded_by: auth.userId });
    }
    return { jobId, group, uploads };
  } catch (e) {
    return { error: cleanError((e as Error).message) };
  }
}

export async function completeUpload(input: { workspaceId: string; jobId: string | null; group: string; uploaded: string[]; failed: string[]; startNow?: boolean }): Promise<{ error?: string; status?: string; reasons?: string[]; missing?: number }> {
  const auth = await authorize(input.workspaceId);
  if ("error" in auth) return { error: auth.error };
  const admin = createAdminClient();
  const { data: rows } = await admin.from("content_media").select("id, storage_path, uploaded_by").eq("upload_group", input.group).eq("workspace_id", input.workspaceId);
  let missing = 0;
  for (const row of rows ?? []) {
    if (!row.storage_path || row.uploaded_by !== auth.userId) continue;
    assertPathInWorkspace(row.storage_path, input.workspaceId);
    const ok = !input.failed.includes(row.id) && (await objectExists(admin, row.storage_path));
    if (!ok) {
      missing++;
      // Kept (never silently dropped) but clearly marked so it can be re-uploaded.
      await admin.from("content_media").update({ review_status: "rejected", review_note: "Upload did not finish. Upload this file again." }).eq("id", row.id);
    }
  }

  let status: string | undefined;
  let reasons: string[] = [];
  if (input.jobId) {
    const { data: job } = await admin.from("content_jobs").select("status, workspace_id").eq("id", input.jobId).single();
    if (job?.workspace_id !== input.workspaceId) return { error: "Job mismatch." };
    if (job.status === "incoming") {
      const r = await intakeJob(admin, input.jobId, { id: auth.userId, label: auth.isStaff ? "agency" : "client" });
      status = r.next;
      reasons = r.reasons;
    } else status = job.status;
  } else if (!auth.isStaff) {
    const { data: ws } = await admin.from("content_workspaces").select("name").eq("id", input.workspaceId).single();
    const { notify } = await import("@/lib/integrations/notify");
    await notify(admin, { kind: "client_upload", title: `${ws?.name ?? "Client"} uploaded ${rows?.length ?? 0} file(s)`, workspaceId: input.workspaceId, link: "/inbox" });
  }
  revalidatePath("/");
  revalidatePath("/inbox");
  return { status, reasons, missing };
}
