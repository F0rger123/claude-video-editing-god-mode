import { createClient } from "@/lib/supabase/server";
import { getFocus } from "@/lib/data";
import { PageHeader } from "@/components/ui";
import { UploadComposer } from "@/components/upload-composer";

export const metadata = { title: "Upload" };

export default async function UploadPage({ searchParams }: { searchParams: Promise<{ job?: string; script?: string; preset?: string; record?: string }> }) {
  const { job: jobId, script, preset: presetId, record } = await searchParams;
  const supabase = await createClient();
  const focus = await getFocus();
  const [{ data: workspaces }, { data: job }, { data: presets }, { data: scripts }, { data: preset }, { data: library }] = await Promise.all([
    supabase.from("content_workspaces").select("id, name, allowed_platforms, is_agency").is("archived_at", null).order("is_agency", { ascending: false }).order("name"),
    jobId ? supabase.from("content_jobs").select("id, title, workspace_id").eq("id", jobId).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("content_style_presets").select("id, workspace_id, kind, name, instructions, is_default").is("archived_at", null).order("name"),
    supabase.from("content_script_ideas").select("id, workspace_id, hook, form, script, outline").in("status", ["liked", "saved"]).order("created_at", { ascending: false }).limit(100),
    presetId ? supabase.from("content_style_presets").select("id, name, workspace_id").eq("id", presetId).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("content_library").select("id, name, kind, notes, workspace_id").is("archived_at", null).order("name").limit(300),
  ]);
  const list = workspaces ?? [];
  const ordered = focus ? [...list.filter((w) => w.id === focus.id), ...list.filter((w) => w.id !== focus.id)] : list;
  return (
    <div>
      <PageHeader title={preset ? "Style references" : job ? "Add footage" : "Upload"} back={preset ? `/clients/${preset.workspace_id}?tab=styles` : job ? `/jobs/${job.id}` : undefined} meta={preset ? preset.name : job ? job.title : "Nothing is edited until the client's rules say so."} />
      <UploadComposer
        staff
        workspaces={ordered}
        fixedWorkspaceId={preset?.workspace_id ?? job?.workspace_id}
        presets={presets ?? []}
        library={library ?? []}
        scripts={scripts ?? []}
        initialScriptId={script ?? null}
        initialRecord={record === "1"}
        presetTarget={preset ? { id: preset.id, name: preset.name } : null}
        allowedPlatforms={job ? list.find((w) => w.id === job.workspace_id)?.allowed_platforms : undefined}
        existingJob={job ? { id: job.id, title: job.title } : null}
        jobHrefPrefix="/jobs/"
        looseHref={preset ? `/clients/${preset.workspace_id}?tab=styles` : "/inbox"}
      />
    </div>
  );
}
