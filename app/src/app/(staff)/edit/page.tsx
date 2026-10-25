import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { QuickEdit, type MakeIdea } from "@/components/quick-edit";
import { brandKitSummaries } from "@/lib/brand-kits";
import { getFocus } from "@/lib/data";

export const metadata = { title: "Make a video" };

/**
 * Make a video, on one screen: for you (never posted) or a client; upload, record (teleprompter)
 * or camera card; optional idea, look, brand kit + colors and references.
 *   /edit?idea=<id>&record=1   start from a saved idea (and open the teleprompter)
 *   /edit?for=<workspace id>   preselect a client
 */
export default async function MakeVideoPage({ searchParams }: { searchParams: Promise<{ idea?: string; for?: string; record?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: workspaces }, { data: ideas }, kits, focus] = await Promise.all([
    supabase.from("content_workspaces").select("id, name, is_agency, allowed_platforms").is("archived_at", null).order("is_agency", { ascending: false }).order("name"),
    supabase.from("content_script_ideas").select("id, workspace_id, hook, form, script, outline").in("status", ["liked", "saved"]).order("decided_at", { ascending: false }).limit(150),
    brandKitSummaries(supabase),
    getFocus(),
  ]);
  return (
    <div>
      <PageHeader title="Make a video" />
      <QuickEdit
        workspaces={workspaces ?? []}
        kits={kits}
        ideas={(ideas ?? []) as MakeIdea[]}
        initialFor={sp.for ?? focus?.id ?? null}
        initialIdeaId={sp.idea ?? null}
        initialRecord={sp.record === "1"}
      />
    </div>
  );
}
