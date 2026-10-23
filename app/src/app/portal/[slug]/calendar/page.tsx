import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortal } from "@/lib/portal";
import { Calendar, calendarRange, type CalendarPost } from "@/components/calendar";
import { PageHeader } from "@/components/ui";
import { localDate, zonedTimeToUtc } from "@/lib/domain/schedule";
import { cookies } from "next/headers";

export const metadata = { title: "Calendar" };

export default async function PortalCalendar({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ view?: string; d?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const portal = await getPortal(slug);
  if (!portal.permissions.can_view_calendar && !portal.permissions.can_view_published) notFound();
  const pick = sp.view ?? (await cookies()).get("azc-portal-cal-view")?.value;
  const view = pick === "month" || pick === "week" ? pick : "list";
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(sp.d ?? "") ? sp.d! : localDate(new Date(), portal.timezone);
  const { start, end } = calendarRange(view, anchor);
  const supabase = await createClient();
  // RLS decides: calendar permission → planned + published; published-only → published.
  const { data } = await supabase
    .from("content_posts")
    .select("id, job_id, platform, status, scheduled_at, job:content_jobs(title, form)")
    .eq("workspace_id", portal.id)
    .gte("scheduled_at", zonedTimeToUtc(start, "00:00", portal.timezone).toISOString())
    .lt("scheduled_at", zonedTimeToUtc(end, "00:00", portal.timezone).toISOString())
    .order("scheduled_at")
    .limit(300);
  const posts: CalendarPost[] = (data ?? []).map((p) => {
    const job = p.job as unknown as { title: string; form: string } | null;
    return { id: p.id, jobId: p.job_id, title: job?.title ?? "", workspaceName: portal.name, platform: p.platform, status: p.status, form: job?.form ?? "short", at: p.scheduled_at as string, thumb: null, href: `/portal/${slug}/review/${p.job_id}` };
  });
  return (
    <div>
      <PageHeader title="Calendar" back={`/portal/${slug}`} />
      <Calendar view={view} anchor={anchor} posts={posts} tz={portal.timezone} baseHref={`/portal/${slug}/calendar`} query={{ view, d: anchor }} showClient={false} />
    </div>
  );
}
