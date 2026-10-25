import Link from "@/components/link";
import { createClient } from "@/lib/supabase/server";
import { getFocus, listWorkspaces, scoped, JOB_COLUMNS, type JobRow } from "@/lib/data";
import { periodStarts } from "@/lib/domain/quota";
import { localDate } from "@/lib/domain/schedule";
import { Meter, PlatformTag, PostPill, Section, StatusPill } from "@/components/ui";
import { Icon } from "@/components/icons";
import type { PackageLimits } from "@/lib/domain/types";
import { Eta } from "@/components/live";
import { PushToggle } from "@/components/push-toggle";

export const metadata = { title: "Today" };

export default async function Dashboard() {
  const supabase = await createClient();
  const [focus, workspaces] = await Promise.all([getFocus(), listWorkspaces()]);
  const tz = focus?.timezone ?? workspaces.find((w) => w.is_agency)?.timezone ?? "America/New_York";
  const now = new Date();
  const today = localDate(now, tz);
  const { monthStart, weekStart } = periodStarts(now);
  const dayStart = new Date(`${today}T00:00:00Z`);
  const dayEnd = new Date(dayStart.getTime() + 36 * 3600e3);
  const weekEnd = new Date(new Date(`${weekStart}T00:00:00Z`).getTime() + 7 * 86400e3).toISOString();

  const scope = <T,>(q: T) => scoped(q, focus?.id);
  const head = { count: "exact" as const, head: true };

  const [uploads, pending, agencyReview, clientReview, failedJobs, attention, failedPosts, integrations, channelsDown, todayPosts, editing, due, weekPosts, ws, postsToApprove] = await Promise.all([
    scope(supabase.from("content_media").select("id", head).is("job_id", null).eq("review_status", "incoming")),
    scope(supabase.from("content_jobs").select("id", head).eq("status", "pending_approval")),
    scope(supabase.from("content_jobs").select("id", head).eq("status", "review").eq("review_stage", "agency")),
    scope(supabase.from("content_jobs").select("id", head).eq("status", "review").eq("review_stage", "client")),
    scope(supabase.from("content_jobs").select("id", head).eq("status", "failed")),
    scope(supabase.from("content_jobs").select(JOB_COLUMNS).eq("needs_attention", true).not("status", "in", "(archived,published)").limit(5)),
    scope(supabase.from("content_posts").select("id", head).eq("status", "failed")),
    supabase.from("content_integrations").select("kind, status, workspace_id, detail").in("status", ["disconnected", "error"]),
    scope(supabase.from("content_channels").select("id", head).eq("is_disconnected", true).eq("enabled", true)),
    scope(supabase.from("content_posts").select("id, platform, status, scheduled_at, job:content_jobs(id, title), workspace_id").gte("scheduled_at", dayStart.toISOString()).lt("scheduled_at", dayEnd.toISOString()).neq("status", "cancelled").order("scheduled_at")),
    scope(supabase.from("content_jobs").select(JOB_COLUMNS).in("status", ["queued", "editing", "rendering"]).order("updated_at", { ascending: false }).limit(8)),
    scope(supabase.from("content_jobs").select("id", head).eq("due_date", today).not("status", "in", "(published,archived)")),
    scope(supabase.from("content_posts").select("id", head).gte("scheduled_at", weekStart).lt("scheduled_at", weekEnd).not("status", "in", "(cancelled,failed)")),
    supabase.from("content_workspaces").select("id, name, package, is_agency").is("archived_at", null).order("is_agency", { ascending: false }).order("name").limit(30),
    scope(supabase.from("content_posts").select("id", head).eq("status", "awaiting_approval")),
  ]);

  const todays = (todayPosts.data ?? []).filter((p) => localDate(new Date(p.scheduled_at as string), tz) === today);
  const nameOf = new Map(workspaces.map((w) => [w.id, w.name]));
  const integrationIssues = (integrations.data ?? []).length + (channelsDown.count ?? 0);
  const { data: bufferRow } = await supabase.from("content_integrations").select("id").eq("kind", "buffer").is("workspace_id", null).maybeSingle();

  // Per-client usage this month (counts, never raw files).
  const clientIds = (ws.data ?? []).filter((w) => !focus || w.id === focus.id).map((w) => w.id);
  const { data: monthJobs } = clientIds.length
    ? await supabase.from("content_jobs").select("workspace_id, form, status").in("workspace_id", clientIds).gte("queued_at", monthStart).not("status", "in", "(pending_approval,incoming,archived)")
    : { data: [] };
  const { data: openJobs } = clientIds.length
    ? await supabase.from("content_jobs").select("workspace_id, status").in("workspace_id", clientIds).in("status", ["pending_approval", "review", "needs_changes"])
    : { data: [] };
  const { data: upcoming } = clientIds.length
    ? await supabase.from("content_posts").select("workspace_id").in("workspace_id", clientIds).eq("status", "scheduled").gte("scheduled_at", now.toISOString())
    : { data: [] };

  const attentionTotal = (uploads.count ?? 0) + (pending.count ?? 0) + (agencyReview.count ?? 0) + (postsToApprove.count ?? 0) + (failedJobs.count ?? 0) + (failedPosts.count ?? 0) + integrationIssues;

  // Only what needs a decision, as plain rows; zeros are not shown.
  const todo = [
    { n: agencyReview.count ?? 0, label: "Videos to review", href: "/inbox#review", tone: "attention" },
    { n: postsToApprove.count ?? 0, label: "Posts to approve", href: "/calendar?view=list&status=awaiting_approval", tone: "attention" },
    { n: pending.count ?? 0, label: "Waiting for your go-ahead to edit", href: "/inbox#pending", tone: "attention" },
    { n: uploads.count ?? 0, label: "Uploads to sort", href: "/inbox", tone: "attention" },
    { n: failedJobs.count ?? 0, label: "Edits that failed", href: "/jobs?status=failed", tone: "danger" },
    { n: failedPosts.count ?? 0, label: "Posts that failed", href: "/calendar?view=list&status=failed", tone: "danger" },
    { n: integrationIssues, label: "Connections to fix", href: "/settings", tone: "danger" },
  ].filter((t) => t.n > 0);

  return (
    <div>
      <header className="mb-6">
        <p className="text-sm text-ash">{now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: tz })}</p>
        <h1 className="t-display mt-1">{attentionTotal ? `${attentionTotal} need${attentionTotal === 1 ? "s" : ""} you.` : "All clear."}</h1>
      </header>
      <PushToggle compact />
      {!bufferRow ? (
        <Link href="/settings#buffer" className="press rise-in mb-4 flex items-center gap-3 rounded-2xl border border-attention/40 bg-attention/[0.06] px-4 py-3">
          <Icon name="link" className="size-5 text-attention" />
          <span className="min-w-0 flex-1 text-sm"><span className="font-semibold">Connect Buffer</span> <span className="text-mist">so finished videos post by themselves. About a minute.</span></span>
          <Icon name="chevron" className="size-4 text-ash" />
        </Link>
      ) : null}

      <div className="mb-8 grid grid-cols-3 gap-2.5">
        <Link href="/edit" className="press col-span-2 flex h-16 items-center justify-center gap-2 rounded-3xl bg-bone text-base font-semibold text-ink">
          <Icon name="spark" className="size-5" /> Make a video
        </Link>
        <Link href="/upload" className="press flex h-16 flex-col items-center justify-center gap-0.5 rounded-3xl border border-rule-strong text-xs">
          <Icon name="upload" className="size-5" /> All options
        </Link>
        <Link href="/inbox" className="press relative flex h-20 flex-col items-center justify-center gap-1 rounded-3xl border border-rule bg-coal text-sm">
          <Icon name="inbox" className="size-5" /> Review
          {(agencyReview.count ?? 0) + (pending.count ?? 0) ? <span className="tabular absolute right-2 top-2 grid min-w-5 place-items-center rounded-full bg-attention px-1.5 text-[11px] font-bold text-ink">{(agencyReview.count ?? 0) + (pending.count ?? 0)}</span> : null}
        </Link>
        <Link href="/scripts" className="press flex h-20 flex-col items-center justify-center gap-1 rounded-3xl border border-rule bg-coal text-sm">
          <Icon name="spark" className="size-5" /> Ideas
        </Link>
        <Link href="/calendar" className="press flex h-20 flex-col items-center justify-center gap-1 rounded-3xl border border-rule bg-coal text-sm">
          <Icon name="calendar" className="size-5" /> Calendar
        </Link>
      </div>

      <Section title="Needs you">
        {todo.length || (attention.data ?? []).length ? (
          <ul className="divide-y divide-rule rounded-2xl border border-rule">
            {todo.map((t) => (
              <li key={t.label}>
                <Link href={t.href} className="press flex items-center gap-3 px-4 py-3.5">
                  <span className={`tabular grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold ${t.tone === "danger" ? "bg-danger/15 text-danger" : "bg-attention/15 text-attention"}`}>{t.n}</span>
                  <span className="flex-1">{t.label}</span>
                  <Icon name="chevron" className="size-4 text-ash" />
                </Link>
              </li>
            ))}
            {((attention.data ?? []) as JobRow[]).map((j) => (
              <li key={j.id}>
                <Link href={`/jobs/${j.id}`} className="press flex items-center gap-3 px-4 py-3.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-attention/15 text-attention">!</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{j.title}</span>
                    <span className="block truncate text-xs text-ash">{j.attention_reason ?? "Flagged for review"}</span>
                  </span>
                  <Icon name="chevron" className="size-4 text-ash" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex items-center gap-3 rounded-2xl border border-rule px-4 py-4 text-sm text-mist">
            <span className="grid size-8 shrink-0 place-items-center rounded-full border border-success/50 text-success">✓</span>
            Nothing is waiting on you.
          </div>
        )}
        {clientReview.count ? (
          <Link href="/jobs?status=review&stage=client" className="mt-2 block text-sm text-ash hover:text-bone">
            {clientReview.count} waiting for a client to approve →
          </Link>
        ) : null}
      </Section>

      <Section title="Posting today" count={todays.length} action={<Link href="/calendar?view=week" className="text-sm text-mist hover:text-bone">Week</Link>}>
        {todays.length ? (
          <ul className="divide-y divide-rule rounded-2xl border border-rule">
            {todays.map((p) => {
              const job = p.job as unknown as { id: string; title: string } | null;
              return (
                <li key={p.id}>
                  <Link href={`/jobs/${job?.id}#posts`} className="press flex items-center gap-3 px-4 py-3">
                    <span className="tabular w-16 shrink-0 text-sm">{new Date(p.scheduled_at as string).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{job?.title}</p>
                      <p className="flex items-center gap-2 text-xs text-ash">
                        <PlatformTag platform={p.platform} /> {nameOf.get(p.workspace_id)}
                      </p>
                    </div>
                    <PostPill status={p.status} />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-rule px-4 py-4 text-sm text-ash">Nothing posts today.</p>
        )}
      </Section>

      {(editing.data ?? []).length ? (
        <Section title="In the editor" count={editing.data!.length}>
          <ul className="grid gap-1.5">
            {((editing.data ?? []) as JobRow[]).map((j) => (
              <li key={j.id}>
                <Link href={`/jobs/${j.id}`} className="press flex items-center gap-3 rounded-xl px-1 py-1.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{j.title}</span>
                    <Eta eta={j.eta_at} status={j.status} className="block text-xs text-mist" />
                  </span>
                  <span className="text-ash">{nameOf.get(j.workspace_id)}</span>
                  <StatusPill status={j.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Clients this month" action={<span className="text-sm text-ash">{weekPosts.count ?? 0} posts this week{due.count ? ` · ${due.count} due today` : ""}</span>}>
        <ul className="divide-y divide-rule rounded-2xl border border-rule">
          {(ws.data ?? [])
            .filter((w) => !focus || w.id === focus.id)
            .map((w) => {
              const pkg = (w.package ?? {}) as PackageLimits;
              const jobs = (monthJobs ?? []).filter((j) => j.workspace_id === w.id);
              const open = (openJobs ?? []).filter((j) => j.workspace_id === w.id).length;
              const sched = (upcoming ?? []).filter((p) => p.workspace_id === w.id).length;
              return (
                <li key={w.id}>
                  <Link href={`/clients/${w.id}`} className="press block px-4 py-3">
                    <div className="mb-2 flex items-baseline justify-between gap-3">
                      <p className="font-medium">{w.name}</p>
                      <p className="text-xs text-ash">{open} open · {sched} scheduled</p>
                    </div>
                    <Meter label="Videos this month" used={jobs.length} limit={(pkg.short_per_month ?? 0) + (pkg.long_per_month ?? 0) || undefined} />
                  </Link>
                </li>
              );
            })}
        </ul>
      </Section>
    </div>
  );
}
