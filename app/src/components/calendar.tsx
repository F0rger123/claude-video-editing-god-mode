import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/icons";
import { PlatformTag, PostPill } from "@/components/ui";
import { localDate } from "@/lib/domain/schedule";

export type CalendarPost = {
  id: string;
  jobId: string;
  title: string;
  workspaceName: string;
  platform: string;
  status: string;
  form: string;
  at: string;
  thumb: string | null;
  href: string;
};

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function mondayOf(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return addDays(iso, -((d.getUTCDay() + 6) % 7));
}

/** Date range covered by a view around an anchor date (YYYY-MM-DD, workspace-local). */
export function calendarRange(view: "month" | "week" | "list", anchor: string): { start: string; end: string } {
  if (view === "week") {
    const start = mondayOf(anchor);
    return { start, end: addDays(start, 7) };
  }
  if (view === "month") {
    const first = `${anchor.slice(0, 7)}-01`;
    const start = mondayOf(first);
    return { start, end: addDays(start, 42) };
  }
  return { start: anchor, end: addDays(anchor, 45) };
}

export function shiftAnchor(view: "month" | "week" | "list", anchor: string, dir: 1 | -1): string {
  if (view === "month") {
    const d = new Date(`${anchor.slice(0, 7)}-01T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + dir);
    return d.toISOString().slice(0, 10);
  }
  return addDays(anchor, dir * (view === "week" ? 7 : 30));
}

function Thumb({ src }: { src: string | null }) {
  return (
    <div className="grid h-14 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-graphite">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        <Icon name="film" className="size-4 text-ash" />
      )}
    </div>
  );
}

function PostLine({ p, tz, showClient, wrap }: { p: CalendarPost; tz: string; showClient: boolean; wrap?: (p: CalendarPost, content: ReactNode) => ReactNode }) {
  const content = (
    <>
      <Thumb src={p.thumb} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{p.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ash">
          <span className="tabular text-mist">{new Date(p.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })}</span>
          <PlatformTag platform={p.platform} />
          {showClient ? <span>{p.workspaceName}</span> : null}
          <span>{p.form === "long" ? "Long" : "Short"}</span>
        </p>
      </div>
      <PostPill status={p.status} />
    </>
  );
  return (
    <li>
      {wrap ? (
        wrap(p, content)
      ) : (
        <Link href={p.href} className="press flex min-w-0 items-center gap-3 px-3 py-2.5">
          {content}
        </Link>
      )}
    </li>
  );
}

function dotTone(status: string) {
  return status === "failed" ? "bg-danger" : status === "published" ? "bg-success" : status === "awaiting_approval" ? "bg-attention" : "bg-bone";
}

/** Month / week / list calendar. Pure presentation: the page decides which posts the viewer may see. */
export function Calendar({
  view,
  anchor,
  posts,
  tz,
  baseHref,
  query,
  showClient,
  wrap,
}: {
  view: "month" | "week" | "list";
  anchor: string;
  posts: CalendarPost[];
  tz: string;
  baseHref: string;
  query: Record<string, string | undefined>;
  showClient: boolean;
  /** Wraps each post line (e.g. in a button that opens a management sheet). Default: link to the video. */
  wrap?: (p: CalendarPost, content: ReactNode) => ReactNode;
}) {
  const today = localDate(new Date(), tz);
  const href = (patch: Record<string, string>) => {
    const qs = new URLSearchParams(Object.entries({ ...query, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `${baseHref}?${qs}`;
  };
  const byDay = new Map<string, CalendarPost[]>();
  for (const p of posts) {
    const day = localDate(new Date(p.at), tz);
    byDay.set(day, [...(byDay.get(day) ?? []), p]);
  }
  const { start } = calendarRange(view, anchor);
  const label =
    view === "month"
      ? new Date(`${anchor.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : view === "week"
        ? `Week of ${new Date(`${start}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
        : `From ${new Date(`${anchor}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <div className="grid grid-cols-3 rounded-full border border-rule p-0.5 text-sm">
          {(["month", "week", "list"] as const).map((v) => (
            <Link key={v} href={href({ view: v })} className={`press rounded-full px-3.5 py-1.5 ${view === v ? "bg-bone font-semibold text-ink" : "text-mist"}`}>
              {v[0].toUpperCase() + v.slice(1)}
            </Link>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Link aria-label="Previous" href={href({ d: shiftAnchor(view, anchor, -1) })} className="press grid size-9 place-items-center rounded-full border border-rule">
            <Icon name="back" className="size-4" />
          </Link>
          <Link href={href({ d: today })} className="press h-9 rounded-full border border-rule px-3 text-sm leading-9">Today</Link>
          <Link aria-label="Next" href={href({ d: shiftAnchor(view, anchor, 1) })} className="press grid size-9 place-items-center rounded-full border border-rule">
            <Icon name="chevron" className="size-4" />
          </Link>
        </div>
      </div>
      <h2 className="t-title mb-3">{label}</h2>

      {view === "month" ? (
        <div>
          <div className="grid grid-cols-7 text-center text-[11px] text-ash">
            {DOW.map((d) => <div key={d} className="py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl border border-rule bg-rule">
            {Array.from({ length: 42 }, (_, i) => addDays(start, i)).map((day) => {
              const list = byDay.get(day) ?? [];
              const inMonth = day.slice(0, 7) === anchor.slice(0, 7);
              return (
                <Link key={day} href={href({ view: "list", d: day })} className={`press flex min-h-16 flex-col gap-1 bg-ink p-1.5 sm:min-h-24 ${inMonth ? "" : "opacity-40"}`}>
                  <span className={`tabular grid size-6 place-items-center rounded-full text-xs ${day === today ? "bg-bone font-semibold text-ink" : "text-mist"}`}>{Number(day.slice(8))}</span>
                  <span className="flex flex-wrap gap-0.5">
                    {list.slice(0, 6).map((p) => (
                      <span key={p.id} title={p.title} className={`size-1.5 rounded-full ${dotTone(p.status)}`} />
                    ))}
                  </span>
                  {list.length ? <span className="hidden truncate text-[10px] text-mist sm:block">{list[0].title}</span> : null}
                </Link>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-ash">Dots: white planned · amber needs approval · green published · red failed. Tap a day for its posts.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {view === "week" ? (
            <nav aria-label="Days" className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 -mx-4 grid grid-cols-7 gap-1 border-b border-rule bg-ink/90 px-4 py-2 backdrop-blur-md">
              {Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((day, i) => {
                const list = byDay.get(day) ?? [];
                return (
                  <a key={day} href={`#d-${day}`} className={`press flex flex-col items-center gap-1 rounded-2xl py-1.5 ${day === today ? "bg-bone text-ink" : "text-mist"}`}>
                    <span className="text-[10px] uppercase tracking-wide opacity-70">{DOW[i].slice(0, 2)}</span>
                    <span className="tabular text-base font-semibold leading-none">{Number(day.slice(8))}</span>
                    <span className="flex h-1.5 gap-0.5">
                      {list.slice(0, 3).map((p) => <span key={p.id} className={`size-1.5 rounded-full ${day === today && dotTone(p.status) === "bg-bone" ? "bg-ink" : dotTone(p.status)}`} />)}
                    </span>
                  </a>
                );
              })}
            </nav>
          ) : null}
          {Array.from({ length: view === "week" ? 7 : 45 }, (_, i) => addDays(view === "week" ? start : anchor, i))
            .filter((day) => view === "week" || byDay.has(day))
            .map((day, i) => {
              const list = (byDay.get(day) ?? []).sort((a, b) => a.at.localeCompare(b.at));
              return (
                <section key={day} id={`d-${day}`} className="rise-in scroll-mt-32" style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}>
                  <h3 className={`mb-1.5 text-sm ${day === today ? "font-semibold text-bone" : "text-mist"}`}>
                    {new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                    {day === today ? " · today" : ""}
                  </h3>
                  {list.length ? (
                    <ul className="divide-y divide-rule rounded-2xl border border-rule">
                      {list.map((p) => <PostLine key={p.id} p={p} tz={tz} showClient={showClient} wrap={wrap} />)}
                    </ul>
                  ) : (
                    <p className="rounded-2xl border border-dashed border-rule px-4 py-3 text-sm text-ash">Nothing planned.</p>
                  )}
                </section>
              );
            })}
          {view === "list" && !posts.length ? <p className="rounded-2xl border border-dashed border-rule px-4 py-6 text-center text-sm text-ash">No posts in the next 45 days.</p> : null}
        </div>
      )}
    </div>
  );
}
