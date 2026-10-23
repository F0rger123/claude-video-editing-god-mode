import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortal } from "@/lib/portal";
import type { Idea } from "@/components/idea-deck";
import { IdeasView } from "@/components/ideas-view";
import { IdeaStudio } from "@/components/idea-studio";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Ideas" };

export default async function PortalScripts({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const portal = await getPortal(slug);
  if (!portal.permissions.can_view_scripts) notFound();
  const supabase = await createClient();
  // RLS limits these to this client's ideas (can_view_scripts).
  const [{ data: fresh }, { data: saved }, { data: passed }, { data: quota }, { data: pending }] = await Promise.all([
    supabase.from("content_script_ideas").select("id, hook, script, angle, why, form, title, style, outline, broll, thumbnail_text, caption").eq("workspace_id", portal.id).eq("status", "new").order("created_at").limit(30),
    supabase.from("content_script_ideas").select("id, hook, script, angle, why, form, title, style, outline, broll, thumbnail_text, caption, status, job_id").eq("workspace_id", portal.id).in("status", ["liked", "saved", "recorded"]).order("decided_at", { ascending: false }).limit(100),
    supabase.from("content_script_ideas").select("id, hook, script, angle, why, form, title, style, outline, broll, thumbnail_text, caption, status, reason").eq("workspace_id", portal.id).eq("status", "passed").order("decided_at", { ascending: false }).limit(50),
    portal.permissions.can_generate_ideas ? supabase.rpc("content_client_idea_quota", { p_workspace: portal.id }) : Promise.resolve({ data: null }),
    portal.permissions.can_generate_ideas ? supabase.from("content_idea_requests").select("id, form, style, status").eq("workspace_id", portal.id).in("status", ["pending", "writing"]).limit(1).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const canSwipe = portal.permissions.can_swipe_scripts && !portal.isStaffPreview;
  return (
    <div>
      <PageHeader title="Ideas" back={`/portal/${slug}`} />
      {portal.permissions.can_generate_ideas && !portal.isStaffPreview ? <IdeaStudio workspaceId={portal.id} pending={pending ?? null} quota={(quota as { used: number; limit: number } | null) ?? null} compact={(fresh ?? []).length > 0} /> : null}
      <IdeasView fresh={(fresh ?? []) as Idea[]} approved={(saved ?? []) as never} passed={(passed ?? []) as never} canSwipe={canSwipe} workspaceId={portal.id} uploadHref={`/portal/${slug}/upload`} jobHref={`/portal/${slug}/review/`} canAdd={canSwipe} />
    </div>
  );
}
