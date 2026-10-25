import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { signedViewUrls } from "@/lib/integrations/storage";
import type { BrandKitSummary } from "@/components/upload-composer";

type UserClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Brand kits at a glance (main logo preview, colors, item count) for the workspaces this user can
 * see. The user client reads through RLS; the admin client only signs preview URLs for those rows.
 */
export async function brandKitSummaries(supabase: UserClient, workspaceIds?: string[]): Promise<BrandKitSummary[]> {
  let q = supabase.from("content_brand_assets").select("workspace_id, kind, value, storage_path, mime_type, is_primary").is("archived_at", null).is("project_id", null).limit(2000);
  if (workspaceIds?.length) q = q.in("workspace_id", workspaceIds);
  const { data } = await q;
  const rows = data ?? [];
  const logoOf = (ws: string) => {
    const logos = rows.filter((r) => r.workspace_id === ws && r.kind === "logo" && r.storage_path && r.mime_type?.startsWith("image/"));
    return (logos.find((l) => l.is_primary) ?? logos[0])?.storage_path ?? null;
  };
  const ids = [...new Set(rows.map((r) => r.workspace_id as string))];
  const paths = ids.map(logoOf).filter((p): p is string => Boolean(p));
  const urls = isAdminConfigured() && paths.length ? await signedViewUrls(createAdminClient(), paths, 3600) : new Map<string, string>();
  return ids.map((ws) => {
    const logo = logoOf(ws);
    const colors = rows.filter((r) => r.workspace_id === ws && r.kind === "color" && r.value).sort((a, b) => Number(b.is_primary) - Number(a.is_primary)).map((r) => r.value as string);
    return { workspace_id: ws, logo: logo ? urls.get(logo) ?? null : null, colors, items: rows.filter((r) => r.workspace_id === ws).length };
  });
}
