"use server";

import { revalidatePath } from "next/cache";
import { getStaffClient, cleanError } from "@/lib/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { objectExists, signedUploadUrl } from "@/lib/integrations/storage";
import type { ActionState } from "@/lib/forms";

const UUID = /^[0-9a-f-]{36}$/i;
export type BrandKind = "logo" | "watermark" | "color" | "font" | "intro" | "outro" | "music" | "photo" | "reference" | "other";
const KINDS: BrandKind[] = ["logo", "watermark", "color", "font", "intro", "outro", "music", "photo", "reference", "other"];
const kindOf = (v: unknown): BrandKind => (KINDS.includes(String(v) as BrandKind) ? (String(v) as BrandKind) : "other");
const safe = (name: string) => name.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "-").slice(-100) || "file";

function refresh(workspaceId: string) {
  revalidatePath(`/clients/${workspaceId}`);
  revalidatePath("/upload");
}

/** The workspace (and project, if any) must be visible to this staff user through RLS. */
async function scope(ctx: Exclude<Awaited<ReturnType<typeof getStaffClient>>, { error: string }>, workspaceId: string, projectId: string | null) {
  if (!UUID.test(workspaceId)) return "Unknown client.";
  const { data: ws } = await ctx.supabase.from("content_workspaces").select("id").eq("id", workspaceId).maybeSingle();
  if (!ws) return "Client not found.";
  if (projectId) {
    const { data: p } = await ctx.supabase.from("content_projects").select("workspace_id").eq("id", projectId).maybeSingle();
    if (p?.workspace_id !== workspaceId) return "Project not found.";
  }
  return null;
}

/** Step 1 of adding brand files (logos, fonts, intro/outro, references): rows + signed upload URLs. */
export async function prepareBrandUpload(input: { workspaceId: string; projectId: string | null; kind: string; files: { name: string; size: number; type: string }[] }) {
  const ctx = await getStaffClient();
  if ("error" in ctx) return { error: ctx.error };
  const projectId = input.projectId && UUID.test(input.projectId) ? input.projectId : null;
  const problem = await scope(ctx, input.workspaceId, projectId);
  if (problem) return { error: problem };
  const admin = createAdminClient();
  const kind = kindOf(input.kind);
  // The first logo / watermark becomes the main one automatically.
  const { count } = await ctx.supabase.from("content_brand_assets").select("id", { count: "exact", head: true }).eq("workspace_id", input.workspaceId).eq("kind", kind).eq("is_primary", true).is("archived_at", null).is("project_id", null);
  const uploads: { id: string; url: string }[] = [];
  for (const [n, f] of input.files.slice(0, 30).entries()) {
    const id = crypto.randomUUID();
    const path = `brand/${input.workspaceId}/${id}-${safe(f.name)}`;
    const { error } = await ctx.supabase.from("content_brand_assets").insert({
      id,
      workspace_id: input.workspaceId,
      project_id: projectId,
      kind,
      name: f.name.replace(/\.[^.]+$/, "").slice(0, 120) || "File",
      storage_path: path,
      file_name: f.name.slice(0, 200),
      mime_type: f.type || null,
      is_primary: !projectId && !count && n === 0 && ["logo", "watermark", "intro", "outro"].includes(kind),
      created_by: ctx.userId,
    });
    if (error) return { error: cleanError(error.message) };
    uploads.push({ id, url: (await signedUploadUrl(admin, path)).url });
  }
  return { uploads };
}

/** Step 2: rows whose file never arrived are removed, and reported. */
export async function finishBrandUpload(workspaceId: string, ids: string[]) {
  const ctx = await getStaffClient();
  if ("error" in ctx) return { error: ctx.error };
  const admin = createAdminClient();
  const { data } = await ctx.supabase.from("content_brand_assets").select("id, storage_path").in("id", ids.filter((i) => UUID.test(i)));
  let missing = 0;
  for (const row of data ?? []) {
    if (row.storage_path && !(await objectExists(admin, row.storage_path))) {
      missing++;
      await ctx.supabase.from("content_brand_assets").delete().eq("id", row.id);
    }
  }
  refresh(workspaceId);
  return { missing };
}

/** A brand color, or a link (reference video, music, font page). */
export async function addBrandItem(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getStaffClient();
  if ("error" in ctx) return ctx;
  const workspaceId = String(fd.get("workspace") ?? "");
  const projectId = UUID.test(String(fd.get("project") ?? "")) ? String(fd.get("project")) : null;
  const problem = await scope(ctx, workspaceId, projectId);
  if (problem) return { error: problem };
  const kind = kindOf(fd.get("kind"));
  const name = String(fd.get("name") ?? "").trim();
  const notes = String(fd.get("notes") ?? "").trim().slice(0, 1000) || null;
  if (kind === "color") {
    const value = String(fd.get("value") ?? "").trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) return { error: "Pick a color." };
    const { count } = await ctx.supabase.from("content_brand_assets").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("kind", "color").eq("is_primary", true).is("archived_at", null).is("project_id", null);
    const { error } = await ctx.supabase.from("content_brand_assets").insert({ workspace_id: workspaceId, project_id: projectId, kind, name: name || value.toUpperCase(), value: value.toLowerCase(), notes, is_primary: !projectId && !count, created_by: ctx.userId });
    if (error) return { error: cleanError(error.message) };
    refresh(workspaceId);
    return { success: "Color added." };
  }
  const url = String(fd.get("url") ?? "").trim();
  if (!/^https?:\/\//i.test(url)) return { error: "Paste a link that starts with https://" };
  let fallback = url;
  try {
    fallback = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return { error: "That link doesn't look right." };
  }
  const { error } = await ctx.supabase.from("content_brand_assets").insert({ workspace_id: workspaceId, project_id: projectId, kind, name: (name || fallback).slice(0, 120), url, notes, created_by: ctx.userId });
  if (error) return { error: cleanError(error.message) };
  refresh(workspaceId);
  return { success: "Link added." };
}

/** Make an asset the main one of its kind (main logo, main color…). */
export async function setPrimaryBrandAsset(id: string): Promise<ActionState> {
  const ctx = await getStaffClient();
  if ("error" in ctx) return ctx;
  if (!UUID.test(id)) return { error: "Unknown item." };
  const { data: a } = await ctx.supabase.from("content_brand_assets").select("id, workspace_id, kind, project_id").eq("id", id).maybeSingle();
  if (!a) return { error: "Not found." };
  if (a.project_id) return { error: "Project files can't be the main brand asset." };
  await ctx.supabase.from("content_brand_assets").update({ is_primary: false }).eq("workspace_id", a.workspace_id).eq("kind", a.kind).is("project_id", null);
  const { error } = await ctx.supabase.from("content_brand_assets").update({ is_primary: true }).eq("id", id);
  if (error) return { error: cleanError(error.message) };
  refresh(a.workspace_id);
  return { success: "Saved." };
}

export async function removeBrandAsset(id: string): Promise<ActionState> {
  const ctx = await getStaffClient();
  if ("error" in ctx) return ctx;
  if (!UUID.test(id)) return { error: "Unknown item." };
  const { data: a } = await ctx.supabase.from("content_brand_assets").update({ archived_at: new Date().toISOString(), is_primary: false }).eq("id", id).select("workspace_id").maybeSingle();
  if (!a) return { error: "Not found." };
  refresh(a.workspace_id);
  return { success: "Removed." };
}

/** Create or edit a project (campaign / series) for a client or for your own business. */
export async function saveProject(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getStaffClient();
  if ("error" in ctx) return ctx;
  const workspaceId = String(fd.get("workspace") ?? "");
  const id = String(fd.get("id") ?? "");
  const problem = await scope(ctx, workspaceId, null);
  if (problem) return { error: problem };
  const name = String(fd.get("name") ?? "").trim().slice(0, 120);
  const brief = String(fd.get("brief") ?? "").trim().slice(0, 4000) || null;
  const status = fd.get("status") === "done" ? "done" : "active";
  if (!name) return { error: "Give the project a name." };
  if (UUID.test(id)) {
    const { error } = await ctx.supabase.from("content_projects").update({ name, brief, status }).eq("id", id).eq("workspace_id", workspaceId);
    if (error) return { error: cleanError(error.message) };
    refresh(workspaceId);
    return { success: "Project saved." };
  }
  const { error } = await ctx.supabase.from("content_projects").insert({ workspace_id: workspaceId, name, brief, created_by: ctx.userId });
  if (error) return { error: cleanError(error.message) };
  refresh(workspaceId);
  return { success: "Project created." };
}
