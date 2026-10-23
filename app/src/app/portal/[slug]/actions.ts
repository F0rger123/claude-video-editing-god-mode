"use server";

import { AGENCY_NAME } from "@/lib/brand";
import { revalidatePath } from "next/cache";
import { getUserClient, cleanError } from "@/lib/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/integrations/notify";
import type { ActionState } from "@/lib/forms";

/**
 * Client actions only call the narrow security-definer RPCs from migration 0001, which
 * re-check membership and the specific permission flag in Postgres. Nothing here uses
 * the service role for the decision itself.
 */
export async function clientDecide(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getUserClient();
  if ("error" in ctx) return ctx;
  const version = String(fd.get("version"));
  const decision = String(fd.get("decision"));
  const note = String(fd.get("note") ?? "").trim() || null;
  const { error } = await ctx.supabase.rpc("content_client_decide", { p_version: version, p_decision: decision, p_note: note });
  if (error) return { error: cleanError(error.message) };
  revalidatePath(`/portal`, "layout");
  return { success: decision === "approved" ? "Approved. Thank you!" : `Got it. Your changes are with ${AGENCY_NAME}.` };
}

export async function clientComment(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getUserClient();
  if ("error" in ctx) return ctx;
  const at = fd.get("at") ? Number(fd.get("at")) : null;
  const { error } = await ctx.supabase.rpc("content_client_comment", {
    p_version: String(fd.get("version")),
    p_body: String(fd.get("body") ?? ""),
    p_at: at !== null && Number.isFinite(at) ? at : null,
    p_url: String(fd.get("url") ?? "").trim() || null,
  });
  if (error) return { error: cleanError(error.message) };
  revalidatePath(`/portal`, "layout");
  return { success: "Comment added." };
}

export async function clientApproveCaption(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getUserClient();
  if ("error" in ctx) return ctx;
  const post = String(fd.get("post"));
  const { error } = await ctx.supabase.rpc("content_client_approve_caption", { p_post: post });
  if (error) return { error: cleanError(error.message) };
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("content_posts").select("workspace_id, job_id, platform").eq("id", post).single();
    if (data) await notify(admin, { kind: "client_feedback", title: `Client approved the ${data.platform} caption`, workspaceId: data.workspace_id, jobId: data.job_id, link: `/jobs/${data.job_id}#posts` });
  } catch {
    // Notification is best effort; the approval itself is saved.
  }
  revalidatePath(`/portal`, "layout");
  return { success: "Caption approved." };
}
