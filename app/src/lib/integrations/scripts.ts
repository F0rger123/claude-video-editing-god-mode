import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { ideaRequestPrompt, parseFullIdeas, parseIdeas, scriptPrompt, type IdeaDecision } from "@/lib/domain/scripts";
import type { AdminClient } from "@/lib/supabase/admin";
import type { BrandProfile } from "@/lib/domain/types";

/**
 * Script idea writer. Normally the bridge on the editing PC writes ideas with Claude Code (your
 * subscription, no paid API). If ANTHROPIC_API_KEY is set on the server, "Write more" also works
 * instantly from the app. Both use the same prompt (src/lib/domain/scripts.ts).
 */
export async function historyFor(admin: AdminClient, workspaceId: string): Promise<IdeaDecision[]> {
  const { data } = await admin
    .from("content_script_ideas")
    .select("hook, status, reason, form")
    .eq("workspace_id", workspaceId)
    .in("status", ["liked", "passed", "saved", "recorded"])
    .order("decided_at", { ascending: false })
    .limit(60);
  return (data ?? []) as IdeaDecision[];
}

/** Writes one "Content ideas" request right away when the server has an API key. */
export async function writeRequestOnServer(admin: AdminClient, requestId: string): Promise<boolean> {
  if (!process.env.ANTHROPIC_API_KEY) return false;
  const { data: req } = await admin.from("content_idea_requests").select("*, workspace:content_workspaces(id, name, brand_profile)").eq("id", requestId).single();
  if (!req || req.status !== "pending") return false;
  await admin.from("content_idea_requests").update({ status: "writing" }).eq("id", req.id);
  try {
    const ws = req.workspace as { id: string; name: string; brand_profile: BrandProfile };
    const client = new Anthropic();
    const response = await client.messages.create({
      model: process.env.ANTHROPIC_CAPTION_MODEL || "claude-opus-5-5",
      max_tokens: 16000,
      output_config: { effort: "low" },
      messages: [{ role: "user", content: ideaRequestPrompt({ workspaceName: ws.name, brand: ws.brand_profile ?? {}, form: req.form, style: req.style, topic: req.topic, count: req.count, history: await historyFor(admin, ws.id) }) }],
    });
    const ideas = parseFullIdeas(response.content.map((b) => (b.type === "text" ? b.text : "")).join(""), req.form, req.style);
    if (!ideas.length) throw new Error("No ideas came back.");
    await admin.from("content_script_ideas").insert(ideas.map((i) => ({ ...i, workspace_id: ws.id, source: "claude", request_id: req.id })));
    await admin.from("content_idea_requests").update({ status: "done", finished_at: new Date().toISOString() }).eq("id", req.id);
    return true;
  } catch (e) {
    await admin.from("content_idea_requests").update({ status: "failed", error: (e as Error).message.slice(0, 300), finished_at: new Date().toISOString() }).eq("id", req.id);
    return true;
  }
}

export async function writeIdeasOnServer(admin: AdminClient, ws: { id: string; name: string; brand_profile: BrandProfile; scripts_per_batch: number }): Promise<number | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const client = new Anthropic();
  const response = await client.messages.create({
    model: process.env.ANTHROPIC_CAPTION_MODEL || "claude-opus-5-5",
    max_tokens: 8000,
    output_config: { effort: "low" },
    messages: [{ role: "user", content: scriptPrompt({ workspaceName: ws.name, brand: ws.brand_profile ?? {}, count: ws.scripts_per_batch, history: await historyFor(admin, ws.id) }) }],
  });
  if (response.stop_reason === "refusal") return 0;
  const ideas = parseIdeas(response.content.map((b) => (b.type === "text" ? b.text : "")).join(""));
  if (ideas.length) await admin.from("content_script_ideas").insert(ideas.map((i) => ({ ...i, workspace_id: ws.id, source: "claude" })));
  return ideas.length;
}
