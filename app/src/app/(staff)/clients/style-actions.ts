"use server";

import { revalidatePath } from "next/cache";
import { getStaffClient, cleanError } from "@/lib/actions";
import type { ActionState } from "@/lib/forms";

const UUID = /^[0-9a-f-]{36}$/i;

/** Create or update a named style (captions / sound effects / editing look) for one client. */
export async function savePreset(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getStaffClient();
  if ("error" in ctx) return ctx;
  const workspaceId = String(fd.get("workspace"));
  const id = String(fd.get("preset") ?? "");
  const kind = String(fd.get("kind"));
  const name = String(fd.get("name") ?? "").trim().slice(0, 80);
  const instructions = String(fd.get("instructions") ?? "").trim().slice(0, 2000) || null;
  const isDefault = fd.get("is_default") === "on";
  if (!UUID.test(workspaceId) || !["captions", "sound", "edit"].includes(kind)) return { error: "Unknown style." };
  if (!name) return { error: "Give the style a name." };
  if (isDefault) await ctx.supabase.from("content_style_presets").update({ is_default: false }).eq("workspace_id", workspaceId).eq("kind", kind);
  const row = { workspace_id: workspaceId, kind, name, instructions, is_default: isDefault };
  const { error } = UUID.test(id)
    ? await ctx.supabase.from("content_style_presets").update(row).eq("id", id)
    : await ctx.supabase.from("content_style_presets").insert(row);
  if (error) return { error: cleanError(error.message) };
  revalidatePath(`/clients/${workspaceId}`);
  return { success: "Style saved." };
}

export async function archivePreset(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getStaffClient();
  if ("error" in ctx) return ctx;
  const id = String(fd.get("preset"));
  const { data, error } = await ctx.supabase.from("content_style_presets").update({ archived_at: new Date().toISOString(), is_default: false }).eq("id", id).select("workspace_id").single();
  if (error || !data) return { error: cleanError(error?.message) };
  revalidatePath(`/clients/${data.workspace_id}`);
  return { success: "Style removed. Videos already made with it are unchanged." };
}
