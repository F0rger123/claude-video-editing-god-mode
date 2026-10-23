import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getFocus, listWorkspaces } from "@/lib/data";
import type { Idea } from "@/components/idea-deck";
import { IdeasView } from "@/components/ideas-view";
import { IdeaStudio } from "@/components/idea-studio";
import { ActionForm, SubmitButton } from "@/components/form";
import { PageHeader } from "@/components/ui";
import { requestIdeas } from "@/app/actions/scripts";

export const metadata = { title: "Ideas" };

export default async function ScriptsPage({ searchParams }: { searchParams: Promise<{ ws?: string }> }) {
  const sp = await searchParams;
  const [focus, workspaces] = await Promise.all([getFocus(), listWorkspaces()]);
  const wsId = sp.ws || focus?.id || workspaces.find((w) => w.is_agency)?.id || workspaces[0]?.id;
  const ws = workspaces.find((w) => w.id === wsId);
  const supabase = await createClient();
  const [{ data: fresh }, { data: saved }, { data: passed }, { data: settings }, { data: pending }] = wsId
    ? await Promise.all([
        supabase.from("content_script_ideas").select("id, hook, script, angle, why, form, title, style, outline, broll, thumbnail_text, caption").eq("workspace_id", wsId).eq("status", "new").order("created_at").limit(30),
        supabase.from("content_script_ideas").select("id, hook, script, angle, why, form, title, style, outline, broll, thumbnail_text, caption, status, job_id").eq("workspace_id", wsId).in("status", ["liked", "saved", "recorded"]).order("decided_at", { ascending: false }).limit(100),
        supabase.from("content_script_ideas").select("id, hook, script, angle, why, form, title, style, outline, broll, thumbnail_text, caption, status, reason").eq("workspace_id", wsId).eq("status", "passed").order("decided_at", { ascending: false }).limit(50),
        supabase.from("content_workspaces").select("scripts_enabled, ideas_per_request").eq("id", wsId).single(),
        supabase.from("content_idea_requests").select("id, form, style, status").eq("workspace_id", wsId).in("status", ["pending", "writing"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: null }, { data: null }];

  return (
    <div>
      <PageHeader title="Ideas" />
      <nav className="-mx-4 mb-5 flex gap-1.5 overflow-x-auto px-4">
        {workspaces.map((w) => (
          <Link key={w.id} href={`/scripts?ws=${w.id}`} className={`press shrink-0 rounded-full px-4 py-2 text-sm ${w.id === wsId ? "bg-bone font-semibold text-ink" : "border border-rule text-mist"}`}>
            {w.name}
          </Link>
        ))}
      </nav>
      {ws ? (
        <>
          <IdeaStudio key={`studio-${wsId}`} workspaceId={ws.id} pending={pending ?? null} perRequest={settings?.ideas_per_request ?? 5} compact={(fresh ?? []).length > 0} />
          <IdeasView key={wsId} fresh={(fresh ?? []) as Idea[]} approved={(saved ?? []) as never} passed={(passed ?? []) as never} canSwipe workspaceId={ws.id} uploadHref="/upload" jobHref="/jobs/" canAdd />
          <ActionForm action={requestIdeas} className="mt-5">
            <input type="hidden" name="workspace" value={ws.id} />
            <SubmitButton variant="ghost" pending="Writing…" className="w-full">{settings?.scripts_enabled ? "Quick refill (mixed ideas)" : `Turn on automatic ideas for ${ws.name}`}</SubmitButton>
          </ActionForm>
        </>
      ) : null}
    </div>
  );
}
