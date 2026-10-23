import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth";
import { normalizePermissions } from "@/lib/domain/permissions";
import type { JobStatus, Permissions } from "@/lib/domain/types";

export type PortalContext = {
  id: string;
  name: string;
  slug: string;
  logo_path: string | null;
  allowed_platforms: string[];
  timezone: string;
  permissions: Permissions;
  isStaffPreview: boolean;
};

/**
 * Resolves a portal for the signed-in user. Clients must be active members (content_portal_workspace
 * returns nothing otherwise). Staff may open any portal read-only to see exactly what a client sees.
 */
export const getPortal = cache(async (slug: string): Promise<PortalContext> => {
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=/portal/${encodeURIComponent(slug)}`);
  const supabase = await createClient();
  const { data } = await supabase.rpc("content_portal_workspace", { p_slug: slug });
  if (data) {
    return { ...(data as Omit<PortalContext, "permissions" | "isStaffPreview">), permissions: normalizePermissions((data as { permissions: unknown }).permissions), isStaffPreview: false };
  }
  if (viewer.staffRole) {
    const { data: ws } = await supabase.from("content_workspaces").select("id, name, slug, logo_path, allowed_platforms, timezone, default_permissions, access_mode").eq("slug", slug).maybeSingle();
    if (ws && ws.access_mode !== "agency_only") {
      return { ...ws, permissions: normalizePermissions(ws.default_permissions), isStaffPreview: true };
    }
  }
  notFound();
});

/** What a client sees instead of internal pipeline states. */
export function clientStatus(status: JobStatus, stage: string | null): string {
  switch (status) {
    case "incoming":
    case "pending_approval":
      return "Received";
    case "queued":
    case "editing":
    case "rendering":
      return "Being edited";
    case "review":
      return stage === "client" ? "Ready for you" : "In review";
    case "needs_changes":
      return "Changes in progress";
    case "approved":
      return "Approved";
    case "scheduled":
    case "publishing":
      return "Scheduled";
    case "published":
      return "Published";
    case "failed":
      return "Being looked at";
    case "archived":
      return "Closed";
  }
}
