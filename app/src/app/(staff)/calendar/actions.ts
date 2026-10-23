"use server";

import { revalidatePath } from "next/cache";
import { getStaffClient, cleanError } from "@/lib/actions";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import { existingSlots, sendPostToBuffer } from "@/lib/workflow";
import { audit } from "@/lib/integrations/notify";
import { pickSlot, slotWarnings, zonedTimeToUtc } from "@/lib/domain/schedule";
import type { Platform, ScheduleRules } from "@/lib/domain/types";
import type { ActionState } from "@/lib/forms";

const UUID = /^[0-9a-f-]{36}$/i;
const OPEN = ["draft", "awaiting_approval", "approved", "failed"];

type PostCtx = {
  id: string;
  job_id: string;
  workspace_id: string;
  platform: string;
  status: string;
  scheduled_at: string | null;
  buffer_post_id: string | null;
  workspace: { timezone: string; schedule_rules: ScheduleRules } | null;
};

function refresh(jobIds: string[]) {
  revalidatePath("/calendar");
  revalidatePath("/");
  for (const id of new Set(jobIds)) revalidatePath(`/jobs/${id}`);
}

function fmt(at: Date, tz: string) {
  return at.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz });
}

/** Approve one post and hand it to Buffer. Returns a short problem description, or null when scheduled. */
async function approveAndSend(admin: AdminClient, post: PostCtx, actor: { id: string; label: string }): Promise<string | null> {
  if (post.status !== "approved") {
    await admin.from("content_posts").update({ caption_approved: true, status: "approved", last_error: null, attempts: 0, buffer_post_id: null }).eq("id", post.id);
    await audit(admin, { workspaceId: post.workspace_id, actorId: actor.id, actorLabel: actor.label, action: "post_approved", entity: "post", entityId: post.id });
  }
  await sendPostToBuffer(admin, post.id);
  const { data: after } = await admin.from("content_posts").select("status, last_error").eq("id", post.id).single();
  return after?.status === "scheduled" ? null : after?.last_error ?? "Buffer did not accept it yet.";
}

/**
 * One-tap post management from the calendar:
 *   move (exact time) · shift_N (+N minutes) · next_slot · asap (in 20 minutes) (best free slot by the client's rules)
 *   approve (approve + send to Buffer) · cancel (don't post this one)
 * Times are workspace-local. Rule clashes are shown as notes, never blocked: the owner decides.
 */
export async function postQuickAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await getStaffClient();
  if ("error" in ctx) return ctx;
  const id = String(formData.get("post") ?? "");
  if (!UUID.test(id)) return { error: "Unknown post." };
  // RLS proves this staff user may see the post before the service client touches it.
  const { data } = await ctx.supabase.from("content_posts").select("id, job_id, workspace_id, platform, status, scheduled_at, buffer_post_id, workspace:content_workspaces(timezone, schedule_rules)").eq("id", id).maybeSingle();
  if (!data) return { error: "Post not found." };
  const post = data as unknown as PostCtx;
  const admin = createAdminClient();
  const tz = post.workspace?.timezone ?? "America/New_York";
  const rules = post.workspace?.schedule_rules ?? {};
  const intent = String(formData.get("intent") ?? "");
  const locked = Boolean(post.buffer_post_id) && post.status !== "failed";
  if (locked) return { error: "Already sent to Buffer. Change it in Buffer." };
  if (!OPEN.includes(post.status)) return { error: "This post can't be changed any more." };

  if (intent === "approve") {
    const problem = await approveAndSend(admin, post, { id: ctx.userId, label: ctx.role });
    refresh([post.job_id]);
    return problem ? { error: problem } : { success: "Approved and scheduled in Buffer." };
  }
  if (intent === "cancel") {
    const { error } = await ctx.supabase.from("content_posts").update({ status: "cancelled" }).eq("id", post.id);
    if (error) return { error: cleanError(error.message) };
    refresh([post.job_id]);
    return { success: "Won't be posted." };
  }

  let at: Date | null = null;
  if (intent === "move") {
    const when = String(formData.get("when") ?? "");
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(when)) return { error: "Pick a date and time." };
    at = zonedTimeToUtc(when.slice(0, 10), when.slice(11, 16), tz);
  } else if (intent.startsWith("shift_")) {
    const minutes = Number(intent.slice(6));
    if (!Number.isFinite(minutes) || Math.abs(minutes) > 60 * 24 * 60) return { error: "Unknown change." };
    const base = post.scheduled_at ? new Date(post.scheduled_at) : new Date();
    at = new Date(base.getTime() + minutes * 60000);
  } else if (intent === "next_slot") {
    at = pickSlot({ rules, timezone: tz, platform: post.platform as Platform, existing: await existingSlots(admin, post.workspace_id, post.id), now: new Date() });
    if (!at) return { error: "No free slot in the next 60 days. Pick a time yourself." };
  } else if (intent === "asap") {
    at = new Date(Date.now() + 20 * 60000);
  } else {
    return { error: "Unknown action." };
  }
  if (at.getTime() < Date.now() + 5 * 60000) return { error: "That time has passed. Pick a later one." };

  const { error } = await ctx.supabase.from("content_posts").update({ scheduled_at: at.toISOString(), slot_source: intent === "next_slot" ? "auto" : "manual" }).eq("id", post.id);
  if (error) return { error: cleanError(error.message) };
  const warnings = intent === "next_slot" ? [] : slotWarnings({ rules, timezone: tz, platform: post.platform as Platform, existing: await existingSlots(admin, post.workspace_id, post.id) }, at);
  refresh([post.job_id]);
  return { success: `Moved to ${fmt(at, tz)}.${warnings.length ? ` Note: ${warnings.join(" ")}` : ""}` };
}

/** Approve several posts at once (e.g. everything waiting this week). Reports what still needs a fix. */
export async function approvePosts(_: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await getStaffClient();
  if ("error" in ctx) return ctx;
  const ids = formData.getAll("post").map(String).filter((id) => UUID.test(id)).slice(0, 100);
  if (!ids.length) return { error: "Nothing to approve." };
  const { data } = await ctx.supabase.from("content_posts").select("id, job_id, workspace_id, platform, status, scheduled_at, buffer_post_id").in("id", ids).in("status", ["awaiting_approval", "approved", "draft"]).is("buffer_post_id", null);
  const posts = (data ?? []) as unknown as PostCtx[];
  if (!posts.length) return { error: "These posts were already handled." };
  const admin = createAdminClient();
  let ok = 0;
  const problems: string[] = [];
  for (const post of posts) {
    const problem = await approveAndSend(admin, post, { id: ctx.userId, label: ctx.role });
    if (problem) problems.push(problem);
    else ok++;
  }
  refresh(posts.map((p) => p.job_id));
  if (!problems.length) return { success: `All ${ok} approved and scheduled.` };
  const first = [...new Set(problems)].slice(0, 2).join(" ");
  return ok ? { success: `${ok} scheduled. ${problems.length} need a fix: ${first}` } : { error: `None could be scheduled: ${first}` };
}
