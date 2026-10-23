import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { signedViewUrls } from "@/lib/integrations/storage";
import { getFocus, listWorkspaces, scoped } from "@/lib/data";
import { Calendar, calendarRange, type CalendarPost } from "@/components/calendar";
import { PageHeader } from "@/components/ui";
import { localDate, zonedTimeToUtc } from "@/lib/domain/schedule";
import { PLATFORMS, PLATFORM_LABEL } from "@/lib/domain/types";
import { toLocalInput } from "@/lib/format";
import { ApproveAllBar, PostSheet } from "./post-sheet";
import { cookies } from "next/headers";

export const metadata = { title: "Calendar" };

type Search = { view?: string; d?: string; ws?: string; platform?: string; status?: string; form?: string };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  // No view in the link → the one used last time (cookie), else week.
  const saved = (await cookies()).get("azc-cal-view")?.value;
  const pick = sp.view ?? saved;
  const view = pick === "month" || pick === "list" ? pick : "week";
  const [focus, workspaces] = await Promise.all([getFocus(), listWorkspaces()]);
  const wsId = sp.ws || focus?.id || null;
  const tz = workspaces.find((w) => w.id === wsId)?.timezone ?? workspaces.find((w) => w.is_agency)?.timezone ?? "America/New_York";
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(sp.d ?? "") ? sp.d! : localDate(new Date(), tz);
  const { start, end } = calendarRange(view, anchor);

  const supabase = await createClient();
  let q = scoped(
    supabase
      .from("content_posts")
      .select("id, job_id, workspace_id, platform, status, scheduled_at, buffer_post_id, job:content_jobs(title, form, current_version_id), version:content_versions(thumbnail_path)")
      .gte("scheduled_at", zonedTimeToUtc(start, "00:00", tz).toISOString())
      .lt("scheduled_at", zonedTimeToUtc(end, "00:00", tz).toISOString())
      .neq("status", "cancelled")
      .order("scheduled_at")
      .limit(500),
    wsId,
  );
  if (sp.platform && (PLATFORMS as readonly string[]).includes(sp.platform)) q = q.eq("platform", sp.platform);
  if (sp.status) q = q.eq("status", sp.status);
  const { data } = await q;
  const rows = (data ?? []).filter((p) => !sp.form || (p.job as unknown as { form: string } | null)?.form === sp.form);
  const thumbs = isAdminConfigured()
    ? await signedViewUrls(createAdminClient(), rows.map((p) => (p.version as unknown as { thumbnail_path: string | null } | null)?.thumbnail_path).filter(Boolean) as string[], 3600)
    : new Map<string, string>();
  const names = Object.fromEntries(workspaces.map((w) => [w.id, w.name]));
  const posts: CalendarPost[] = rows.map((p) => {
    const job = p.job as unknown as { title: string; form: string } | null;
    const thumb = (p.version as unknown as { thumbnail_path: string | null } | null)?.thumbnail_path;
    return { id: p.id, jobId: p.job_id, title: job?.title ?? "", workspaceName: names[p.workspace_id] ?? "", platform: p.platform, status: p.status, form: job?.form ?? "short", at: p.scheduled_at as string, thumb: thumb ? thumbs.get(thumb) ?? null : null, href: `/jobs/${p.job_id}#posts` };
  });
  const editable = new Map(rows.filter((p) => (!p.buffer_post_id || p.status === "failed") && ["draft", "awaiting_approval", "approved", "failed"].includes(p.status)).map((p) => [p.id, toLocalInput(p.scheduled_at, tz)]));
  const awaiting = rows.filter((p) => p.status === "awaiting_approval" && !p.buffer_post_id && new Date(p.scheduled_at as string) > new Date()).map((p) => p.id);

  return (
    <div>
      <PageHeader title="Calendar" />
      <details className="group mb-4" open={Boolean(sp.ws || sp.platform || sp.status || sp.form)}>
        <summary className="press inline-flex h-10 cursor-pointer list-none items-center gap-2 rounded-full border border-rule px-4 text-sm text-mist">
          Filters{sp.ws || sp.platform || sp.status || sp.form ? " · on" : ""}
        </summary>
      <form className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input type="hidden" name="view" value={view} />
        <input type="hidden" name="d" value={anchor} />
        <select name="ws" defaultValue={wsId ?? ""} className="field" aria-label="Client">
          <option value="">All clients</option>
          {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <select name="platform" defaultValue={sp.platform ?? ""} className="field" aria-label="Platform">
          <option value="">All platforms</option>
          {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}
        </select>
        <select name="status" defaultValue={sp.status ?? ""} className="field" aria-label="Status">
          <option value="">Any status</option>
          {["awaiting_approval", "approved", "scheduled", "published", "failed"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </select>
        <select name="form" defaultValue={sp.form ?? ""} className="field" aria-label="Type">
          <option value="">Any type</option>
          <option value="short">Short-form</option>
          <option value="long">Long-form</option>
        </select>
        <button className="press col-span-2 h-11 rounded-full border border-rule-strong text-sm sm:col-span-4">Apply filters</button>
      </form>
      </details>
      <ApproveAllBar key={awaiting.join()} ids={awaiting} />
      <Calendar
        view={view}
        anchor={anchor}
        posts={posts}
        tz={tz}
        baseHref="/calendar"
        query={{ view, d: anchor, ws: sp.ws, platform: sp.platform, status: sp.status, form: sp.form }}
        showClient={!wsId}
        wrap={(p, content) => (
          <PostSheet post={p} tz={tz} whenLocal={editable.get(p.id) ?? null} editable={editable.has(p.id)}>
            {content}
          </PostSheet>
        )}
      />
    </div>
  );
}
