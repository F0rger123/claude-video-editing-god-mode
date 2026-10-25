import Link from "@/components/link";
import { createClient } from "@/lib/supabase/server";
import { ButtonLink, EmptyState, Meter, PageHeader } from "@/components/ui";
import { periodStarts } from "@/lib/domain/quota";
import type { PackageLimits } from "@/lib/domain/types";

export const metadata = { title: "Clients" };

const MODE: Record<string, string> = { manual: "Manual approval", auto: "Auto edit", conditional: "Conditional", full_auto: "Full auto" };
const ACCESS: Record<string, string> = { agency_only: "Agency only", client_upload: "Client upload", client_collab: "Collaboration" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const { archived } = await searchParams;
  const supabase = await createClient();
  let q = supabase.from("content_workspaces").select("id, name, is_agency, automation_mode, access_mode, package, archived_at").order("is_agency", { ascending: false }).order("name");
  q = archived ? q.not("archived_at", "is", null) : q.is("archived_at", null);
  const { data: workspaces } = await q;
  const { monthStart } = periodStarts(new Date());
  const { data: jobs } = await supabase.from("content_jobs").select("workspace_id, form, status").gte("queued_at", monthStart).not("status", "in", "(pending_approval,incoming,archived)");
  const { data: open } = await supabase.from("content_jobs").select("workspace_id").in("status", ["pending_approval", "review", "needs_changes"]);

  return (
    <div>
      <PageHeader title="Clients" action={<ButtonLink href="/clients/new" icon="plus">Add</ButtonLink>} />
      {(workspaces ?? []).length ? (
        <ul className="grid gap-3">
          {(workspaces ?? []).map((w) => {
            const used = (jobs ?? []).filter((j) => j.workspace_id === w.id);
            const pkg = (w.package ?? {}) as PackageLimits;
            const waiting = (open ?? []).filter((j) => j.workspace_id === w.id).length;
            return (
              <li key={w.id}>
                <Link href={`/clients/${w.id}`} className="press block rounded-2xl border border-rule p-4 hover:border-rule-strong">
                  <div className="flex items-baseline gap-2">
                    <p className="text-lg font-semibold tracking-tight">{w.name}</p>
                    {w.is_agency ? <span className="t-label">your workspace</span> : null}
                    {waiting ? <span className="ml-auto text-sm text-attention">{waiting} waiting</span> : null}
                  </div>
                  <p className="mb-3 text-sm text-ash">{MODE[w.automation_mode]} · {ACCESS[w.access_mode]}</p>
                  <Meter label="Short-form this month" used={used.filter((j) => j.form === "short").length} limit={pkg.short_per_month} />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState title={archived ? "No archived clients." : "No clients yet."} action={<ButtonLink href="/clients/new">Add the first client</ButtonLink>} />
      )}
      <p className="mt-6 text-center text-sm">
        <Link href={archived ? "/clients" : "/clients?archived=1"} className="text-ash underline-offset-4 hover:underline">{archived ? "Back to active clients" : "Archived clients"}</Link>
      </p>
    </div>
  );
}
