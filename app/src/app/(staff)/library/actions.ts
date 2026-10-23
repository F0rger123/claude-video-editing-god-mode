"use server";

import { revalidatePath } from "next/cache";
import { getStaffClient, cleanError } from "@/lib/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { objectExists, signedUploadUrl } from "@/lib/integrations/storage";
import type { ActionState } from "@/lib/forms";

const UUID = /^[0-9a-f-]{36}$/i;
const LIBRARY_KINDS = ["sfx", "music", "overlay", "lut", "font", "caption", "reference", "other"] as const;
type Kind = (typeof LIBRARY_KINDS)[number];
const kindOf = (v: unknown): Kind => ((LIBRARY_KINDS as readonly string[]).includes(String(v)) ? (v as Kind) : "other");
const wsOf = (v: unknown): string | null => (UUID.test(String(v ?? "")) ? String(v) : null);
const safe = (name: string) => name.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "-").slice(-100) || "file";

/** Step 1 of an upload from the phone or computer: rows + signed upload URLs. */
export async function prepareLibraryUpload(input: { kind: string; workspaceId: string | null; notes: string; files: { name: string; size: number; type: string }[] }) {
  const ctx = await getStaffClient();
  if ("error" in ctx) return { error: ctx.error };
  const admin = createAdminClient();
  const uploads: { id: string; url: string }[] = [];
  for (const f of input.files.slice(0, 50)) {
    const id = crypto.randomUUID();
    const path = `library/${id}-${safe(f.name)}`;
    const { error } = await ctx.supabase.from("content_library").insert({
      id,
      workspace_id: wsOf(input.workspaceId),
      kind: kindOf(input.kind),
      name: f.name.replace(/\.[^.]+$/, "").slice(0, 120),
      notes: input.notes.trim().slice(0, 1000) || null,
      storage_path: path,
      file_name: f.name.slice(0, 200),
      created_by: ctx.userId,
    });
    if (error) return { error: cleanError(error.message) };
    uploads.push({ id, url: (await signedUploadUrl(admin, path)).url });
  }
  return { uploads };
}

/** Step 2: confirm each file arrived; unfinished ones are marked, never silently dropped. */
export async function finishLibraryUpload(ids: string[]) {
  const ctx = await getStaffClient();
  if ("error" in ctx) return { error: ctx.error };
  const admin = createAdminClient();
  const { data } = await ctx.supabase.from("content_library").select("id, storage_path").in("id", ids.filter((i) => UUID.test(i)));
  let missing = 0;
  for (const row of data ?? []) {
    if (row.storage_path && !(await objectExists(admin, row.storage_path))) {
      missing++;
      await ctx.supabase.from("content_library").update({ sync_error: "Upload did not finish. Upload it again." }).eq("id", row.id);
    }
  }
  revalidatePath("/library");
  return { missing };
}

/** A link, or a file/folder already on the editing PC ("Hey Claude, use this one"). */
export async function addLibraryItem(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getStaffClient();
  if ("error" in ctx) return ctx;
  const source = String(fd.get("source"));
  const value = String(fd.get("value") ?? "").trim();
  const name = String(fd.get("name") ?? "").trim();
  if (!value) return { error: source === "link" ? "Paste the link." : "Paste the file or folder path." };
  if (source === "link" && !/^https?:\/\//i.test(value)) return { error: "Links start with http:// or https://" };
  if (source === "pc" && !/^[a-zA-Z]:\\|^\\\\/.test(value)) return { error: 'Use a full Windows path, like C:\\Users\\you\\Music\\whoosh.wav (tip: Shift + right-click the file → "Copy as path").' };
  const cleanPath = value.replace(/^"|"$/g, "");
  const fallbackName = source === "link" ? new URL(value).pathname.split("/").filter(Boolean).pop() ?? value : cleanPath.split("\\").filter(Boolean).pop() ?? cleanPath;
  const { error } = await ctx.supabase.from("content_library").insert({
    workspace_id: wsOf(fd.get("workspace")),
    kind: kindOf(fd.get("kind")),
    name: (name || fallbackName).replace(/\.[^.]+$/, "").slice(0, 120),
    notes: String(fd.get("notes") ?? "").trim().slice(0, 1000) || null,
    url: source === "link" ? value : null,
    local_path: source === "pc" ? cleanPath : null,
    created_by: ctx.userId,
  });
  if (error) return { error: cleanError(error.message) };
  revalidatePath("/library");
  return { success: source === "pc" ? "Added. The editing PC copies it into the editor's folder within 5 minutes." : "Link added." };
}

export async function updateLibraryItem(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getStaffClient();
  if ("error" in ctx) return ctx;
  const id = String(fd.get("id"));
  if (!UUID.test(id)) return { error: "Unknown item." };
  if (fd.get("intent") === "remove") {
    await ctx.supabase.from("content_library").update({ archived_at: new Date().toISOString() }).eq("id", id);
    revalidatePath("/library");
    return { success: "Removed from the library." };
  }
  const { error } = await ctx.supabase
    .from("content_library")
    .update({ name: String(fd.get("name") ?? "").trim().slice(0, 120) || "Untitled", notes: String(fd.get("notes") ?? "").trim().slice(0, 1000) || null, kind: kindOf(fd.get("kind")), workspace_id: wsOf(fd.get("workspace")) })
    .eq("id", id);
  if (error) return { error: cleanError(error.message) };
  revalidatePath("/library");
  return { success: "Saved." };
}
