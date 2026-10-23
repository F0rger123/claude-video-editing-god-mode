import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { retryOnClockSkew } from "@/lib/supabase/retry";

/**
 * Who is looking? One read per request (React cache), shared by layouts and pages.
 *   staff   — owner / agency user (content_staff)
 *   portals — client workspaces this user can open (content_my_portals)
 * Postgres RLS remains the real gate; this only decides which shell to show.
 */
export type Viewer = {
  userId: string;
  email: string;
  staffRole: "owner" | "agency" | null;
  portals: { slug: string; name: string }[];
};

export const getViewer = cache(async (): Promise<Viewer | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;
  const email = String(claims?.claims?.email ?? "");

  const [{ data: staff }, { data: portals }] = await Promise.all([
    retryOnClockSkew(() => supabase.from("content_staff").select("role").eq("user_id", userId).maybeSingle()),
    retryOnClockSkew(() => supabase.rpc("content_my_portals")),
  ]);
  return {
    userId,
    email,
    staffRole: (staff?.role as Viewer["staffRole"]) ?? null,
    portals: Array.isArray(portals) ? (portals as Viewer["portals"]) : [],
  };
});

/** For staff pages: signed-in staff or redirect. */
export async function requireStaff(): Promise<Viewer & { staffRole: "owner" | "agency" }> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.staffRole) redirect(viewer.portals[0] ? `/portal/${viewer.portals[0].slug}` : "/no-access");
  return viewer as Viewer & { staffRole: "owner" | "agency" };
}
