"use server";

import { revalidatePath } from "next/cache";
import { getStaffClient, cleanError } from "@/lib/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { approveForEditing, intakeJob } from "@/lib/workflow";
import { audit, notify } from "@/lib/integrations/notify";
import { PLATFORMS } from "@/lib/domain/types";
import type { ActionState } from "@/lib/forms";

const UUID = /^[0-9a-f-]{36}$/i;
const ids = (formData: FormData, name: string) => formData.getAll(name).map(String).filter((v) => UUID.test(v)).slice(0, 100);

function done(msg: string): ActionState {
  revalidatePath("/inbox");
  revalidatePath("/");
  return { success: msg };
}

/** Group selected loose clips into ONE video job (Pending Approval, or straight to editing). */
export async function groupIntoJob(_: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await getStaffClient();
  if ("error" in ctx) return ctx;
  const media = ids(formData, "media");
  if (!media.length) return { error: "Select the clips that make up this video." };
  const { data: rows } = await ctx.supabase.from("content_media").select("id, workspace_id, kind, job_id").in("id", media);
  const workspaces = new Set((rows ?? []).map((r) => r.workspace_id));
  if (workspaces.size !== 1) return { error: "Clips from different clients cannot be one video." };
  if ((rows ?? []).some((r) => r.job_id)) return { error: "Some clips already belong to a video." };
  const workspaceId = [...workspaces][0];
  const title = String(formData.get("title") ?? "").trim() || "Untitled video";
  const form = formData.get("form") === "long" ? "long" : "short";
  const platforms = formData.getAll("platforms").map(String).filter((p) => (PLATFORMS as readonly string[]).includes(p));
  const priority = ["low", "normal", "high", "urgent"].includes(String(formData.get("priority"))) ? String(formData.get("priority")) : "normal";
  const startNow = formData.get("start") === "now";
  const note = String(formData.get("note") ?? "").trim();

  const { data: job, error } = await ctx.supabase
    .from("content_jobs")
    .insert({ workspace_id: workspaceId, title: title.slice(0, 160), form, platforms, priority, status: "incoming", source: "agency", created_by: ctx.userId })
    .select("id")
    .single();
  if (error || !job) return { error: cleanError(error?.message) };
  const primary = (rows ?? []).find((r) => r.kind === "video");
  for (const r of rows ?? []) {
    await ctx.supabase.from("content_media").update({ job_id: job.id, review_status: "accepted", role: r.id === primary?.id ? "primary" : r.kind.startsWith("reference") || r.kind === "link" || r.kind === "note" ? "reference" : "source" }).eq("id", r.id);
  }
  if (note) await ctx.supabase.from("content_job_internal").insert({ job_id: job.id, workspace_id: workspaceId, agency_notes: note });
  const admin = createAdminClient();
  try {
    if (startNow) await approveForEditing(admin, job.id, { id: ctx.userId, label: "agency" }, { allowOverage: ctx.role === "owner", isOwner: ctx.role === "owner" });
    else {
      await admin.from("content_jobs").update({ status: "pending_approval" }).eq("id", job.id);
    }
  } catch (e) {
    return { error: (e as Error).message };
  }
  return done(startNow ? `“${title}” sent to the editor.` : `“${title}” created. Approve it when ready.`);
}

/** Mark loose clips: reference only / rejected / re-record requested. */
export async function markMedia(_: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await getStaffClient();
  if ("error" in ctx) return ctx;
  const media = ids(formData, "media");
  const status = String(formData.get("mark"));
  if (!["reference_only", "rejected", "rerecord_requested", "incoming"].includes(status)) return { error: "Unknown action." };
  if (!media.length) return { error: "Select clips first." };
  const note = String(formData.get("note") ?? "").trim() || null;
  const { error, count } = await ctx.supabase
    .from("content_media")
    .update({ review_status: status, review_note: note, role: status === "reference_only" ? "reference" : undefined }, { count: "exact" })
    .in("id", media);
  if (error) return { error: cleanError(error.message) };
  const admin = createAdminClient();
  const { data: rows } = await admin.from("content_media").select("workspace_id").in("id", media).limit(1);
  const ws = rows?.[0]?.workspace_id ?? null;
  await audit(admin, { workspaceId: ws, actorId: ctx.userId, actorLabel: "agency", action: `media_${status}`, entity: "media", detail: { count, note } });
  if (status === "rerecord_requested" && ws) {
    const { data: w } = await admin.from("content_workspaces").select("slug, access_mode").eq("id", ws).single();
    if (w && w.access_mode !== "agency_only") {
      await notify(admin, { kind: "approval_needed", audience: "member", workspaceId: ws, title: "Please re-record a clip", body: note, link: `/portal/${w.slug}/upload` });
    }
  }
  return done(`${count ?? 0} clip(s) updated.`);
}

/** Pending Approval → Queued for one or many jobs (bulk approve), within package rules. */
export async function approveJobs(_: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await getStaffClient();
  if ("error" in ctx) return ctx;
  const jobs = ids(formData, "job");
  if (!jobs.length) return { error: "Select videos to approve." };
  const allowOverage = formData.get("overage") === "on";
  const admin = createAdminClient();
  const errors: string[] = [];
  let ok = 0;
  for (const id of jobs) {
    // Prove visibility through RLS before using the service role.
    const { data } = await ctx.supabase.from("content_jobs").select("id, title").eq("id", id).maybeSingle();
    if (!data) continue;
    try {
      await approveForEditing(admin, id, { id: ctx.userId, label: ctx.role }, { allowOverage, isOwner: ctx.role === "owner" });
      ok++;
    } catch (e) {
      errors.push(`${data.title}: ${(e as Error).message}`);
    }
  }
  revalidatePath("/inbox");
  revalidatePath("/");
  if (errors.length) return { error: `${ok} sent to the editor. ${errors.join(" ")}` };
  return { success: `${ok} video${ok === 1 ? "" : "s"} sent to the editor.` };
}

export async function rejectJobs(_: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await getStaffClient();
  if ("error" in ctx) return ctx;
  const jobs = ids(formData, "job");
  const note = String(formData.get("note") ?? "").trim();
  if (!jobs.length) return { error: "Select videos first." };
  const { error, count } = await ctx.supabase.from("content_jobs").update({ status: "archived" }, { count: "exact" }).in("id", jobs).in("status", ["pending_approval", "incoming"]);
  if (error) return { error: cleanError(error.message) };
  const admin = createAdminClient();
  for (const id of jobs) await audit(admin, { workspaceId: null, actorId: ctx.userId, actorLabel: ctx.role, action: "rejected_before_edit", entity: "job", entityId: id, detail: { note } });
  return done(`${count ?? 0} archived. Nothing was edited.`);
}

/** Re-run the intake rules (for example after changing the client's package or mode). */
export async function rerunIntake(_: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await getStaffClient();
  if ("error" in ctx) return ctx;
  const id = String(formData.get("job"));
  if (!UUID.test(id)) return { error: "Unknown job." };
  const admin = createAdminClient();
  await admin.from("content_jobs").update({ status: "incoming" }).eq("id", id).eq("status", "pending_approval");
  const r = await intakeJob(admin, id, { id: ctx.userId, label: ctx.role });
  return done(r.next === "queued" ? "Sent to the editor." : `Still waiting: ${r.reasons.join(" ")}`);
}
