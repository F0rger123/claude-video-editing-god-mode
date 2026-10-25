"use server";

import { revalidatePath } from "next/cache";
import { getStaffClient, cleanError } from "@/lib/actions";

/**
 * Openverse (api.openverse.org): free, openly licensed sounds and images (Freesound, Wikimedia,
 * Flickr…). Only CC0 / public-domain results are offered, so nothing needs a credit and everything
 * is fine for client work. No API key: anonymous search is rate-limited, which is plenty here.
 */
export type OpenverseHit = { id: string; title: string; url: string; preview: string | null; creator: string | null; license: string; source: string; duration: number | null; attribution: string | null };

const OPENVERSE = "https://api.openverse.org/v1";

export async function searchOpenverse(q: string, type: "audio" | "image"): Promise<{ results?: OpenverseHit[]; error?: string }> {
  const ctx = await getStaffClient();
  if ("error" in ctx) return { error: ctx.error };
  const query = q.trim().slice(0, 120);
  if (!query) return { results: [] };
  const params = new URLSearchParams({ q: query, license: "cc0,pdm", page_size: "20", mature: "false" });
  try {
    const res = await fetch(`${OPENVERSE}/${type === "audio" ? "audio" : "images"}/?${params}`, { headers: { "User-Agent": "AgencyZeroVideoEditor/1.0" }, cache: "no-store" });
    if (res.status === 429) return { error: "Openverse is busy (too many searches). Try again in a minute." };
    if (!res.ok) return { error: `Openverse didn't answer (${res.status}).` };
    const data = (await res.json()) as { results?: Record<string, unknown>[] };
    return {
      results: (data.results ?? [])
        .filter((r) => typeof r.url === "string")
        .map((r) => ({
          id: String(r.id),
          title: String(r.title || "Untitled").slice(0, 120),
          url: String(r.url),
          preview: (r.thumbnail as string) ?? null,
          creator: (r.creator as string) ?? null,
          license: `${String(r.license).toUpperCase()}${r.license_version ? ` ${r.license_version}` : ""}`,
          source: String(r.source ?? ""),
          duration: typeof r.duration === "number" ? Math.round((r.duration as number) / 100) / 10 : null,
          attribution: (r.attribution as string) ?? null,
        })),
    };
  } catch (e) {
    return { error: `Openverse couldn't be reached: ${(e as Error).message}` };
  }
}

/** Add an Openverse result to the library (the editing PC downloads it into the right folder). */
export async function addOpenverseItem(hit: OpenverseHit, kind: "sfx" | "music" | "overlay" | "reference"): Promise<{ ok?: true; error?: string }> {
  const ctx = await getStaffClient();
  if ("error" in ctx) return { error: ctx.error };
  if (!/^https:\/\//i.test(hit.url)) return { error: "That file can't be added." };
  const { error } = await ctx.supabase.from("content_library").insert({
    workspace_id: null,
    kind,
    name: hit.title.slice(0, 120),
    notes: `From Openverse (${hit.source}, ${hit.license}${hit.creator ? `, by ${hit.creator}` : ""}). Free to use, no credit needed.`,
    url: hit.url,
    created_by: ctx.userId,
  });
  if (error) return { error: cleanError(error.message) };
  revalidatePath("/library");
  return { ok: true };
}
