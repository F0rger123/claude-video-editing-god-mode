"use server";

import { AGENCY_NAME } from "@/lib/brand";
import { revalidatePath } from "next/cache";
import { getUserClient, cleanError } from "@/lib/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeIdeasOnServer, writeRequestOnServer } from "@/lib/integrations/scripts";
import { IDEA_STYLES } from "@/lib/domain/scripts";
import type { ActionState } from "@/lib/forms";

const UUID = /^[0-9a-f-]{36}$/i;

async function isStaff(ctx: Exclude<Awaited<ReturnType<typeof getUserClient>>, { error: string }>) {
  const { data } = await ctx.supabase.from("content_staff").select("role").eq("user_id", ctx.userId).maybeSingle();
  return Boolean(data);
}

/** Swipe: liked / passed (optional reason) / saved / archived. Clients go through the permission-checked RPC. */
export async function decideIdea(id: string, status: "liked" | "passed" | "saved" | "archived" | "new", reason?: string | null): Promise<ActionState> {
  const ctx = await getUserClient();
  if ("error" in ctx) return ctx;
  if (!UUID.test(id)) return { error: "Unknown idea." };
  if (await isStaff(ctx)) {
    const { error } = await ctx.supabase
      .from("content_script_ideas")
      .update(status === "new" ? { status, reason: null, decided_by: null, decided_at: null } : { status, reason: reason?.trim().slice(0, 500) || null, decided_by: ctx.userId, decided_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { error: cleanError(error.message) };
  } else {
    if (status === "archived") return { error: "Not allowed." };
    const { error } = await ctx.supabase.rpc("content_client_script", { p_idea: id, p_status: status, p_reason: reason ?? null });
    if (error) return { error: cleanError(error.message) };
  }
  revalidatePath("/scripts");
  revalidatePath("/portal/[slug]/scripts", "page");
  return { success: "Saved." };
}

export async function addIdea(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getUserClient();
  if ("error" in ctx) return ctx;
  const workspaceId = String(fd.get("workspace"));
  const hook = String(fd.get("hook") ?? "").trim();
  const script = String(fd.get("script") ?? "").trim() || null;
  const form = fd.get("form") === "long" ? "long" : "short";
  if (!UUID.test(workspaceId) || !hook) return { error: "Write the hook first." };
  if (await isStaff(ctx)) {
    const { error } = await ctx.supabase.from("content_script_ideas").insert({ workspace_id: workspaceId, hook: hook.slice(0, 400), script, form, source: "manual", status: "saved", decided_by: ctx.userId, decided_at: new Date().toISOString() });
    if (error) return { error: cleanError(error.message) };
  } else {
    const { error } = await ctx.supabase.rpc("content_client_add_script", { p_workspace: workspaceId, p_hook: hook, p_script: script, p_form: form });
    if (error) return { error: cleanError(error.message) };
  }
  revalidatePath("/scripts");
  revalidatePath("/portal/[slug]/scripts", "page");
  return { success: "Idea saved." };
}

export async function updateIdeaScript(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getUserClient();
  if ("error" in ctx) return ctx;
  if (!(await isStaff(ctx))) return { error: `Only ${AGENCY_NAME} edits scripts.` };
  const { error } = await ctx.supabase.from("content_script_ideas").update({ hook: String(fd.get("hook") ?? "").slice(0, 400), script: String(fd.get("script") ?? "").slice(0, 8000) }).eq("id", String(fd.get("idea")));
  if (error) return { error: cleanError(error.message) };
  revalidatePath("/scripts");
  revalidatePath("/portal/[slug]/scripts", "page");
  return { success: "Script saved." };
}

/**
 * "Short-form ideas" / "Long-form ideas": one request in a chosen style. Clients go through the
 * RPC that enforces their permission and monthly limit. Claude writes it on the server when an
 * API key is set, otherwise on the editing PC within about a minute.
 */
export async function requestContentIdeas(_: { error?: string; success?: string; requestId?: string }, fd: FormData): Promise<{ error?: string; success?: string; requestId?: string }> {
  const ctx = await getUserClient();
  if ("error" in ctx) return { error: ctx.error };
  const workspaceId = String(fd.get("workspace"));
  const form = fd.get("form") === "long" ? "long" : "short";
  const styleRaw = String(fd.get("style") ?? "Claude picks").trim();
  const style = (IDEA_STYLES as readonly string[]).includes(styleRaw) ? styleRaw : styleRaw.slice(0, 60) || "Claude picks";
  const topic = String(fd.get("topic") ?? "").trim().slice(0, 500) || null;
  if (!UUID.test(workspaceId)) return { error: "Choose a client." };
  let requestId: string;
  if (await isStaff(ctx)) {
    const { data: ws } = await ctx.supabase.from("content_workspaces").select("ideas_per_request").eq("id", workspaceId).single();
    const { data, error } = await ctx.supabase
      .from("content_idea_requests")
      .insert({ workspace_id: workspaceId, form, style, topic, count: Math.min(10, Number(fd.get("count")) || ws?.ideas_per_request || 5), requested_by: ctx.userId })
      .select("id")
      .single();
    if (error || !data) return { error: cleanError(error?.message) };
    requestId = data.id;
  } else {
    const { data, error } = await ctx.supabase.rpc("content_client_request_ideas", { p_workspace: workspaceId, p_form: form, p_style: style, p_topic: topic });
    if (error) return { error: cleanError(error.message) };
    requestId = data as string;
  }
  // Instant: a plain request is filled from the ideas the editing PC wrote ahead of time.
  const fromPool = !topic && style === "Claude picks" ? await claimPool(requestId, workspaceId, form) : 0;
  const done = fromPool ? true : await writeRequestOnServer(createAdminClient(), requestId).catch(() => false);
  revalidatePath("/scripts");
  revalidatePath("/portal/[slug]/scripts", "page");
  return { requestId, success: done ? "Ideas are ready." : "Claude is writing them. This usually takes about a minute." };
}

/**
 * Hands out ready-made ideas (status 'pool') for this request. All of them → the request is done at
 * once; some → the request asks the PC only for the rest. Returns how many were handed out.
 */
async function claimPool(requestId: string, workspaceId: string, form: "short" | "long"): Promise<number> {
  const admin = createAdminClient();
  const { data: req } = await admin.from("content_idea_requests").select("count").eq("id", requestId).single();
  const want = req?.count ?? 5;
  const { data: pool } = await admin.from("content_script_ideas").select("id").eq("workspace_id", workspaceId).eq("form", form).eq("status", "pool").order("created_at").limit(want);
  const ids = (pool ?? []).map((p) => p.id);
  if (!ids.length) return 0;
  const { data: moved } = await admin.from("content_script_ideas").update({ status: "new", request_id: requestId, created_at: new Date().toISOString() }).in("id", ids).eq("status", "pool").select("id");
  const got = moved?.length ?? 0;
  if (got >= want) await admin.from("content_idea_requests").update({ status: "done", finished_at: new Date().toISOString() }).eq("id", requestId);
  else if (got) await admin.from("content_idea_requests").update({ count: want - got }).eq("id", requestId);
  return got;
}

/** Polled by the page while a request is being written. RLS limits it to visible requests. */
export async function ideaRequestStatus(id: string): Promise<{ status: string; error?: string | null; count?: number }> {
  const ctx = await getUserClient();
  if ("error" in ctx || !UUID.test(id)) return { status: "unknown" };
  const { data } = await ctx.supabase.from("content_idea_requests").select("status, error").eq("id", id).maybeSingle();
  if (!data) return { status: "unknown" };
  const { count } = await ctx.supabase.from("content_script_ideas").select("id", { count: "exact", head: true }).eq("request_id", id);
  return { status: data.status, error: data.error, count: count ?? 0 };
}

/** "Write more": instant with a server key, otherwise the editing PC writes them on its next pass (≤5 min). */
export async function requestIdeas(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getUserClient();
  if ("error" in ctx) return ctx;
  if (!(await isStaff(ctx))) return { error: `Only ${AGENCY_NAME} can request ideas.` };
  const workspaceId = String(fd.get("workspace"));
  const { data: ws } = await ctx.supabase.from("content_workspaces").select("id, name, brand_profile, scripts_per_batch, scripts_enabled").eq("id", workspaceId).maybeSingle();
  if (!ws) return { error: "Client not found." };
  if (!ws.scripts_enabled) await ctx.supabase.from("content_workspaces").update({ scripts_enabled: true }).eq("id", ws.id);
  try {
    const n = await writeIdeasOnServer(createAdminClient(), ws);
    revalidatePath("/scripts");
  revalidatePath("/portal/[slug]/scripts", "page");
    if (n === null) return { success: "Script ideas are on. Claude on the editing PC writes the next batch within about 5 minutes." };
    return { success: `${n} new idea${n === 1 ? "" : "s"}.` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
