import { AGENCY_NAME } from "@/lib/brand";
import Link from "@/components/link";
import { createClient } from "@/lib/supabase/server";
import { getPortal, clientStatus } from "@/lib/portal";
import { ButtonLink, EmptyState, PlatformTag, Section } from "@/components/ui";
import { formatAgo, formatWhen } from "@/lib/format";
import type { JobStatus } from "@/lib/domain/types";
import { Eta } from "@/components/live";
import { PushToggle } from "@/components/push-toggle";

export const metadata = { title: "Your content" };

type Row = { id: string; title: string; status: JobStatus; review_stage: string | null; updated_at: string; source: string; eta_at: string | null };

function JobList({ slug, rows, cta }: { slug: string; rows: Row[]; cta?: string }) {
  return (
    <ul className="divide-y divide-rule rounded-2xl border border-rule">
      {rows.map((j) => (
        <li key={j.id}>
          <Link href={`/portal/${slug}/review/${j.id}`} className="press flex items-center gap-3 px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{j.title}</p>
              <p className="text-sm text-ash">{clientStatus(j.status, j.review_stage)} · {formatAgo(j.updated_at)}</p>
              <Eta eta={j.eta_at} status={j.status} className="text-xs text-mist" />
            </div>
            {cta ? <span className="rounded-full bg-bone px-3.5 py-1.5 text-sm font-semibold text-ink">{cta}</span> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function PortalHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const portal = await getPortal(slug);
  const p = portal.permissions;
  const supabase = await createClient();
  // RLS limits every query below to this workspace and to what the permissions allow.
  const [{ data: jobs }, { data: posts }] = await Promise.all([
    supabase.from("content_jobs").select("id, title, status, review_stage, updated_at, source, eta_at").eq("workspace_id", portal.id).order("updated_at", { ascending: false }).limit(80),
    p.can_view_calendar || p.can_view_published
      ? supabase.from("content_posts").select("id, job_id, platform, status, scheduled_at, published_at, external_url, job:content_jobs(title)").eq("workspace_id", portal.id).order("scheduled_at", { ascending: true }).limit(60)
      : Promise.resolve({ data: [] }),
  ]);
  const list = (jobs ?? []) as Row[];
  const needsYou = list.filter((j) => j.status === "review" && j.review_stage === "client");
  const waiting = list.filter((j) => ["incoming", "pending_approval", "queued", "editing", "rendering", "needs_changes", "review"].includes(j.status) && !(j.status === "review" && j.review_stage === "client"));
  const approved = list.filter((j) => j.status === "approved");
  const now = new Date().getTime();
  const upcoming = (posts ?? []).filter((x) => x.status !== "published" && x.scheduled_at && new Date(x.scheduled_at).getTime() >= now - 3600e3);
  const published = (posts ?? []).filter((x) => x.status === "published").reverse().slice(0, 12);

  return (
    <div>
      <PushToggle compact />
      <h1 className="t-display mb-6">{needsYou.length ? `${needsYou.length} ready for you.` : "Your content."}</h1>

      {p.can_upload ? (
        <ButtonLink href={`/portal/${slug}/upload`} icon="upload" className="mb-8 h-14 w-full text-base">Upload content</ButtonLink>
      ) : null}

      {p.can_view_drafts ? (
        <Section title="Approval needed" count={needsYou.length}>
          {needsYou.length ? <JobList slug={slug} rows={needsYou} cta="Watch" /> : <EmptyState title="Nothing to approve right now." body="New drafts appear here when they are ready for you." />}
        </Section>
      ) : null}

      {waiting.length ? (
        <Section title="In progress" count={waiting.length}>
          <JobList slug={slug} rows={waiting} />
        </Section>
      ) : null}

      {p.can_view_drafts && approved.length ? (
        <Section title="Approved" count={approved.length}>
          <JobList slug={slug} rows={approved} />
        </Section>
      ) : null}

      {p.can_view_calendar ? (
        <Section title="Upcoming posts" count={upcoming.length} action={<Link href={`/portal/${slug}/calendar`} className="text-sm text-mist">Calendar</Link>}>
          {upcoming.length ? (
            <ul className="divide-y divide-rule rounded-2xl border border-rule">
              {upcoming.slice(0, 8).map((x) => (
                <li key={x.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="tabular w-28 shrink-0 text-sm">{formatWhen(x.scheduled_at, portal.timezone)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{(x.job as unknown as { title: string } | null)?.title}</span>
                  <PlatformTag platform={x.platform} />
                </li>
              ))}
            </ul>
          ) : <EmptyState title="No posts scheduled yet." />}
        </Section>
      ) : null}

      {p.can_view_published ? (
        <Section title="Published" count={published.length}>
          {published.length ? (
            <ul className="divide-y divide-rule rounded-2xl border border-rule">
              {published.map((x) => (
                <li key={x.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1 truncate text-sm">{(x.job as unknown as { title: string } | null)?.title}</span>
                  <PlatformTag platform={x.platform} />
                  <span className="text-xs text-ash">{formatAgo(x.published_at)}</span>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="Nothing published yet." />}
        </Section>
      ) : null}

      {!p.can_upload && !p.can_view_drafts && !p.can_view_calendar && !p.can_view_published ? (
        <EmptyState title="Your portal is being set up." body={`${AGENCY_NAME} will turn on uploads and approvals for you.`} />
      ) : null}
    </div>
  );
}
