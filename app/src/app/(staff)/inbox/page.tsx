import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { signedViewUrls } from "@/lib/integrations/storage";
import { getFocus, listWorkspaces, scoped, JOB_COLUMNS, type JobRow } from "@/lib/data";
import { EmptyState, PageHeader, Section, StatusPill } from "@/components/ui";
import { formatAgo } from "@/lib/format";
import { LooseMediaBoard, PendingJobsBoard } from "./boards";

export const metadata = { title: "Inbox" };

export type MediaCard = {
  id: string;
  workspace_id: string;
  job_id: string | null;
  kind: string;
  role: string;
  review_status: string;
  file_name: string | null;
  url: string | null;
  body: string | null;
  duration_seconds: number | null;
  size_bytes: number | null;
  upload_group: string | null;
  created_at: string;
  review_note: string | null;
  src: string | null;
};

export default async function InboxPage() {
  const supabase = await createClient();
  const [focus, workspaces] = await Promise.all([getFocus(), listWorkspaces()]);
  const scope = <T,>(q: T) => scoped(q, focus?.id);
  const mediaCols = "id, workspace_id, job_id, kind, role, review_status, file_name, url, body, duration_seconds, size_bytes, upload_group, created_at, review_note, storage_path";

  const [loose, pending, review, changes] = await Promise.all([
    scope(supabase.from("content_media").select(mediaCols).is("job_id", null).eq("review_status", "incoming").order("created_at", { ascending: false }).limit(120)),
    scope(supabase.from("content_jobs").select(JOB_COLUMNS).eq("status", "pending_approval").order("created_at").limit(60)),
    scope(supabase.from("content_jobs").select(JOB_COLUMNS).eq("status", "review").eq("review_stage", "agency").order("updated_at").limit(60)),
    scope(supabase.from("content_jobs").select(JOB_COLUMNS).eq("status", "needs_changes").order("updated_at").limit(60)),
  ]);
  const pendingJobs = (pending.data ?? []) as JobRow[];
  const { data: pendingMedia } = pendingJobs.length
    ? await supabase.from("content_media").select(mediaCols).in("job_id", pendingJobs.map((j) => j.id)).order("created_at")
    : { data: [] };
  const { data: internals } = pendingJobs.length
    ? await supabase.from("content_job_internal").select("job_id, quota_snapshot, agency_notes").in("job_id", pendingJobs.map((j) => j.id))
    : { data: [] };

  const allMedia = [...(loose.data ?? []), ...(pendingMedia ?? [])];
  const urls = isAdminConfigured() ? await signedViewUrls(createAdminClient(), allMedia.map((m) => m.storage_path).filter(Boolean) as string[], 3600) : new Map();
  const card = (m: (typeof allMedia)[number]): MediaCard => ({ ...m, src: m.storage_path ? urls.get(m.storage_path) ?? null : null });
  const names = Object.fromEntries(workspaces.map((w) => [w.id, w.name]));
  const platformsByWs = Object.fromEntries((await supabase.from("content_workspaces").select("id, allowed_platforms")).data?.map((w) => [w.id, w.allowed_platforms]) ?? []);

  return (
    <div>
      <PageHeader title="Inbox" meta="Sort uploads and approve editing before any editing time is spent." />
      {!(loose.data ?? []).length && !pendingJobs.length && !(review.data ?? []).length && !(changes.data ?? []).length ? (
        <div className="rounded-3xl border border-dashed border-rule px-6 py-14 text-center">
          <p className="text-lg font-semibold">Inbox zero.</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-ash">New uploads, videos waiting for your go-ahead and edits to review land here.</p>
          <a href="/upload" className="press mt-5 inline-flex h-11 items-center rounded-full bg-bone px-5 text-sm font-semibold text-ink">Upload a video</a>
        </div>
      ) : (
      <>

      <Section title="Uploads to sort" count={loose.data?.length ?? 0}>
        {(loose.data ?? []).length ? (
          <LooseMediaBoard media={(loose.data ?? []).map(card)} workspaceNames={names} platformsByWs={platformsByWs} />
        ) : (
          <EmptyState title="No loose uploads." body="Files uploaded with “Sort later”, or by clients, land here to be grouped into videos." />
        )}
      </Section>

      <div id="pending" />
      <Section title="Waiting to edit" count={pendingJobs.length}>
        {pendingJobs.length ? (
          <PendingJobsBoard
            jobs={pendingJobs.map((j) => ({
              ...j,
              workspaceName: names[j.workspace_id] ?? "",
              media: (pendingMedia ?? []).filter((m) => m.job_id === j.id).map(card),
              reasons: ((internals ?? []).find((i) => i.job_id === j.id)?.quota_snapshot as { reasons?: string[] } | null)?.reasons ?? [],
              agencyNotes: (internals ?? []).find((i) => i.job_id === j.id)?.agency_notes ?? null,
            }))}
          />
        ) : (
          <EmptyState title="Nothing waiting." body="Jobs held by manual approval or package limits appear here." />
        )}
      </Section>

      <div id="review" />
      <Section title="Ready for your review" count={review.data?.length ?? 0}>
        {(review.data ?? []).length ? (
          <ul className="divide-y divide-rule rounded-2xl border border-rule">
            {((review.data ?? []) as JobRow[]).map((j) => (
              <li key={j.id}>
                <Link href={`/jobs/${j.id}`} className="press flex items-center gap-3 px-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{j.title}</p>
                    <p className="text-sm text-ash">
                      {names[j.workspace_id]} · V{j.revision_count + 1} · {formatAgo(j.updated_at)}
                    </p>
                  </div>
                  <span className="rounded-full bg-bone px-3.5 py-1.5 text-sm font-semibold text-ink">Watch</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No edits waiting." />
        )}
      </Section>

      <Section title="Changes requested" count={changes.data?.length ?? 0}>
        {(changes.data ?? []).length ? (
          <ul className="divide-y divide-rule rounded-2xl border border-rule">
            {((changes.data ?? []) as JobRow[]).map((j) => (
              <li key={j.id}>
                <Link href={`/jobs/${j.id}`} className="press flex items-center gap-3 px-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{j.title}</p>
                    <p className="truncate text-sm text-ash">{names[j.workspace_id]}{j.attention_reason ? ` · ${j.attention_reason}` : ""}</p>
                  </div>
                  <StatusPill status={j.status} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No change requests." />
        )}
      </Section>
      </>
      )}
    </div>
  );
}
