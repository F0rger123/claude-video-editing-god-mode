import "server-only";
import type { AdminClient } from "@/lib/supabase/admin";

/**
 * Storage adapter (Supabase Storage, private bucket `content-media`).
 *
 * Every path starts with the workspace id. Clients never receive a storage policy: callers
 * must prove access by reading the owning row through RLS first, then ask for a signed URL here.
 * The editor's Google Drive folders remain the editing store; the bridge copies between them.
 */
export const BUCKET = "content-media";

const safeName = (name: string) =>
  name.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "-").slice(-120) || "file";

export const paths = {
  media: (workspaceId: string, mediaId: string, fileName: string) => `${workspaceId}/media/${mediaId}-${safeName(fileName)}`,
  version: (workspaceId: string, jobId: string, n: number, ext = "mp4") => `${workspaceId}/versions/${jobId}/v${n}.${ext}`,
  thumbnail: (workspaceId: string, jobId: string, n: number) => `${workspaceId}/versions/${jobId}/v${n}.jpg`,
  brand: (workspaceId: string, fileName: string) => `${workspaceId}/brand/${Date.now()}-${safeName(fileName)}`,
};

/** A path must belong to the workspace it is used with. */
export function assertPathInWorkspace(path: string, workspaceId: string) {
  if (!path.startsWith(`${workspaceId}/`) || path.includes("..")) throw new Error("Storage path outside workspace.");
}

export async function signedUploadUrl(admin: AdminClient, path: string): Promise<{ url: string; token: string; path: string }> {
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(error?.message ?? "Could not prepare the upload.");
  return { url: data.signedUrl, token: data.token, path: data.path };
}

/** Short-lived view URL (playback in the app). */
export async function signedViewUrl(admin: AdminClient, path: string, seconds = 60 * 30, download?: string): Promise<string | null> {
  const { data } = await admin.storage.from(BUCKET).createSignedUrl(path, seconds, download ? { download } : undefined);
  return data?.signedUrl ?? null;
}

export async function signedViewUrls(admin: AdminClient, list: string[], seconds = 60 * 30): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!list.length) return out;
  const { data } = await admin.storage.from(BUCKET).createSignedUrls([...new Set(list)], seconds);
  for (const item of data ?? []) if (item.path && item.signedUrl) out.set(item.path, item.signedUrl);
  return out;
}

export async function objectExists(admin: AdminClient, path: string): Promise<boolean> {
  const slash = path.lastIndexOf("/");
  const { data } = await admin.storage.from(BUCKET).list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 1 });
  return Boolean(data?.some((o) => o.name === path.slice(slash + 1)));
}
