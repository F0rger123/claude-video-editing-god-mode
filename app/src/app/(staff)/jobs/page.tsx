import { AGENCY_NAME } from "@/lib/brand";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getFocus, listWorkspaces, scoped, JOB_COLUMNS, type JobRow } from "@/lib/data";
import { EmptyState, PageHeader, StatusPill } from "@/components/ui";
import { JOB_STATUSES, JOB_STATUS_LABEL, PLATFORMS, PLATFORM_LABEL } from "@/lib/domain/types";
import { formatAgo } from "@/lib/format";

export const metadata = { title: "All content" };

type Search = { q?: string; status?: string; platform?: string; form?: string; ws?: string; from?: string; to?: string; uploader?: string; stage?: string };

export default async function JobsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [focus, workspaces] = await Promise.all([getFocus(), listWorkspaces()]);
  const wsFilter = sp.ws || focus?.id || null;

  let q = scoped(supabase.from("content_jobs").select(JOB_COLUMNS).order("updated_at", { ascending: false }).limit(100), wsFilter);
  if (sp.q) q = q.ilike("title", `%${sp.q.replace(/[%_]/g, "")}%`);
  if (sp.status && (JOB_STATUSES as readonly string[]).includes(sp.status)) q = q.eq("status", sp.status);
  else q = q.neq("status", "archived");
  if (sp.stage === "client" || sp.stage === "agency") q = q.eq("review_stage", sp.stage);
  if (sp.platform && (PLATFORMS as readonly string[]).includes(sp.platform)) q = q.contains("platforms", [sp.platform]);
  if (sp.form === "short" || sp.form === "long") q = q.eq("form", sp.form);
  if (sp.uploader === "client" || sp.uploader === "agency" || sp.uploader === "drive") q = q.eq("source", sp.uploader);
  if (sp.from) q = q.gte("created_at", sp.from);
  if (sp.to) q = q.lte("created_at", `${sp.to}T23:59:59Z`);
  const { data } = await q;
  const jobs = (data ?? []) as JobRow[];
  const names = Object.fromEntries(workspaces.map((w) => [w.id, w.name]));
  const filtered = Boolean(sp.q || sp.status || sp.platform || sp.form || sp.from || sp.to || sp.uploader);

  return (
    <div>
      <PageHeader title="All content" />
      <form className="mb-5 grid gap-2" role="search">
        <input name="q" defaultValue={sp.q} placeholder="Search titles" className="field" type="search" enterKeyHint="search" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <select name="ws" defaultValue={wsFilter ?? ""} className="field" aria-label="Client">
            <option value="">All clients</option>
            {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <select name="status" defaultValue={sp.status ?? ""} className="field" aria-label="Status">
            <option value="">Any status</option>
            {JOB_STATUSES.map((s) => <option key={s} value={s}>{JOB_STATUS_LABEL[s]}</option>)}
          </select>
          <select name="platform" defaultValue={sp.platform ?? ""} className="field" aria-label="Platform">
            <option value="">Any platform</option>
            {PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}
          </select>
          <select name="form" defaultValue={sp.form ?? ""} className="field" aria-label="Type">
            <option value="">Any type</option>
            <option value="short">Short-form</option>
            <option value="long">Long-form</option>
          </select>
          <select name="uploader" defaultValue={sp.uploader ?? ""} className="field" aria-label="Uploaded by">
            <option value="">Anyone uploaded</option>
            <option value="agency">{AGENCY_NAME}</option>
            <option value="client">Client</option>
            <option value="drive">Drive folder</option>
          </select>
          <input type="date" name="from" defaultValue={sp.from} className="field" aria-label="From date" />
          <input type="date" name="to" defaultValue={sp.to} className="field" aria-label="To date" />
        </div>
        <div className="flex gap-2">
          <button className="press h-11 flex-1 rounded-full bg-bone text-sm font-semibold text-ink">Filter</button>
          {filtered ? <Link href="/jobs" className="press grid h-11 place-items-center rounded-full border border-rule px-5 text-sm">Clear</Link> : null}
        </div>
      </form>

      {jobs.length ? (
        <ul className="divide-y divide-rule rounded-2xl border border-rule">
          {jobs.map((j) => (
            <li key={j.id}>
              <Link href={`/jobs/${j.id}`} className="press flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{j.title}</p>
                  <p className="truncate text-sm text-ash">
                    {names[j.workspace_id]} · {j.form === "short" ? "Short" : "Long"} · {j.platforms.map((p) => PLATFORM_LABEL[p as keyof typeof PLATFORM_LABEL] ?? p).join(", ") || "no platform"} · {formatAgo(j.updated_at)}
                  </p>
                </div>
                <StatusPill status={j.status} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={filtered ? "Nothing matches these filters." : "No content yet."} action={filtered ? <Link href="/jobs" className="text-sm underline underline-offset-4">Clear filters</Link> : <Link href="/upload" className="text-sm underline underline-offset-4">Upload the first video</Link>} />
      )}
    </div>
  );
}
