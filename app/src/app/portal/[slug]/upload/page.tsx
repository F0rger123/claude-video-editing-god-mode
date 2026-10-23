import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortal } from "@/lib/portal";
import { PageHeader } from "@/components/ui";
import { UploadComposer } from "@/components/upload-composer";

export const metadata = { title: "Upload" };

export default async function PortalUpload({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ job?: string; script?: string; record?: string }> }) {
  const { slug } = await params;
  const { job: jobId, script, record } = await searchParams;
  const portal = await getPortal(slug);
  if (!portal.permissions.can_upload || portal.isStaffPreview) notFound();
  const supabase = await createClient();
  const [{ data: job }, { data: presets }, { data: scripts }] = await Promise.all([
    jobId ? supabase.from("content_jobs").select("id, title").eq("id", jobId).eq("workspace_id", portal.id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("content_style_presets").select("id, workspace_id, kind, name, instructions, is_default").eq("workspace_id", portal.id).is("archived_at", null),
    portal.permissions.can_view_scripts
      ? supabase.from("content_script_ideas").select("id, workspace_id, hook, form, script, outline").eq("workspace_id", portal.id).in("status", ["liked", "saved"]).limit(50)
      : Promise.resolve({ data: [] }),
  ]);
  return (
    <div>
      <PageHeader
        title={job ? "Add footage" : "Upload"}
        back={`/portal/${slug}`}
        meta={job ? job.title : "A few quick steps. Every take, B-roll clip and reference for one video goes together."}
      />
      <UploadComposer
        staff={false}
        fixedWorkspaceId={portal.id}
        allowedPlatforms={portal.allowed_platforms}
        existingJob={job}
        presets={presets ?? []}
        scripts={scripts ?? []}
        initialScriptId={script ?? null}
        initialRecord={record === "1"}
        jobHrefPrefix={`/portal/${slug}/review/`}
        looseHref={`/portal/${slug}`}
      />
    </div>
  );
}
