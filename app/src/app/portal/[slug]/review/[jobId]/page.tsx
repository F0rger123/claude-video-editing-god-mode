import { AGENCY_NAME } from "@/lib/brand";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signedViewUrl } from "@/lib/integrations/storage";
import { getPortal, clientStatus } from "@/lib/portal";
import { ButtonLink, PageHeader, PlatformTag, Section } from "@/components/ui";
import { formatAgo, formatWhen } from "@/lib/format";
import type { JobStatus } from "@/lib/domain/types";
import { ClientCaptions, ClientReview } from "./client-review";
import { ProgressSteps } from "@/components/progress-steps";

export const metadata = { title: "Review" };

export default async function PortalReview({ params }: { params: Promise<{ slug: string; jobId: string }> }) {
  const { slug, jobId } = await params;
  const portal = await getPortal(slug);
  const supabase = await createClient();
  // RLS: only this client's jobs, and only versions released to them.
  const { data: job } = await supabase.from("content_jobs").select("id, title, status, review_stage, workspace_id, current_version_id, updated_at").eq("id", jobId).eq("workspace_id", portal.id).maybeSingle();
  if (!job) notFound();
  const [{ data: versions }, { data: feedback }, { data: posts }] = await Promise.all([
    supabase.from("content_versions").select("id, number, storage_path, decision, created_at").eq("job_id", jobId).eq("client_visible", true).order("number", { ascending: false }),
    supabase.from("content_feedback").select("id, version_id, body, at_seconds, reference_url, author_label, created_at").eq("job_id", jobId).eq("internal", false).order("created_at"),
    supabase.from("content_posts").select("id, platform, caption, hashtags, cta, title, scheduled_at, status, caption_approved").eq("job_id", jobId).neq("status", "cancelled"),
  ]);
  const current = versions?.[0] ?? null;
  const admin = createAdminClient();
  // Signed only after RLS proved this version is visible to this client.
  const src = current ? await signedViewUrl(admin, current.storage_path, 3600) : null;
  const download = current && portal.permissions.can_download_final && ["approved", "scheduled", "published"].includes(job.status) ? await signedViewUrl(admin, current.storage_path, 3600, `${job.title}.mp4`) : null;
  const waitingForClient = job.status === "review" && job.review_stage === "client" && current?.id === job.current_version_id;

  return (
    <div>
      <PageHeader title={job.title} back={`/portal/${slug}`} meta={`${clientStatus(job.status as JobStatus, job.review_stage)} · ${current ? `Version ${current.number}` : "no draft yet"} · ${formatAgo(job.updated_at)}`} />
      <ProgressSteps status={job.status as JobStatus} client />
      {current ? (
        <ClientReview
          versionId={current.id}
          src={src}
          feedback={(feedback ?? []).filter((f) => f.version_id === current.id)}
          canComment={portal.permissions.can_comment && !portal.isStaffPreview}
          canApprove={portal.permissions.can_approve && waitingForClient && !portal.isStaffPreview}
          canRequestChanges={portal.permissions.can_request_changes && waitingForClient && !portal.isStaffPreview}
        />
      ) : (
        <div className="rounded-3xl border border-dashed border-rule px-5 py-12 text-center text-sm text-ash">
          {portal.permissions.can_view_drafts ? "Your video is being edited. You will see the draft here when it is ready." : `${AGENCY_NAME} is working on this video.`}
        </div>
      )}
      {download ? <ButtonLink href={download} variant="ghost" icon="upload" className="mt-4 w-full">Download final</ButtonLink> : null}
      {portal.permissions.can_upload && !portal.isStaffPreview && job.status !== "published" ? (
        <ButtonLink href={`/portal/${slug}/upload?job=${job.id}`} variant="ghost" icon="plus" className="mt-3 w-full">Add or replace footage</ButtonLink>
      ) : null}
      {(posts ?? []).length && portal.permissions.can_view_calendar ? (
        <Section title="Posts">
          <ClientCaptions posts={posts ?? []} canApprove={portal.permissions.can_approve && !portal.isStaffPreview} tz={portal.timezone} />
        </Section>
      ) : null}
      {(versions ?? []).length > 1 ? (
        <Section title="Earlier versions">
          <ul className="grid gap-1 text-sm text-mist">
            {versions!.slice(1).map((v) => <li key={v.id}>Version {v.number} · {v.decision.replace("_", " ")} · {formatWhen(v.created_at, portal.timezone)}</li>)}
          </ul>
        </Section>
      ) : null}
      <p className="mt-6 flex flex-wrap gap-2 text-xs text-ash">{(posts ?? []).map((p) => <PlatformTag key={p.id} platform={p.platform} />)}</p>
    </div>
  );
}
