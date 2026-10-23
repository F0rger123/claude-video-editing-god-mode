import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { signedViewUrls } from "@/lib/integrations/storage";
import { listWorkspaces } from "@/lib/data";
import { ActionForm, SubmitButton } from "@/components/form";
import { EmptyState, PageHeader } from "@/components/ui";
import { LibraryAdd } from "./library-add";
import { Disclosure } from "@/components/disclosure";
import { updateLibraryItem } from "./actions";

export const metadata = { title: "Library" };

const TABS = [
  ["sfx", "Sound effects"],
  ["overlay", "Overlays"],
  ["lut", "LUTs"],
  ["font", "Fonts"],
  ["caption", "Captions"],
  ["music", "Music"],
  ["reference", "References"],
  ["other", "Other"],
] as const;

/** Everything the editor can use: upload it, link it, or point at it on the editing PC. */
export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind: k } = await searchParams;
  const kind = TABS.some(([t]) => t === k) ? k! : "sfx";
  const supabase = await createClient();
  const [workspaces, { data: items }] = await Promise.all([
    listWorkspaces(),
    supabase.from("content_library").select("*").eq("kind", kind).is("archived_at", null).order("name").limit(300),
  ]);
  const urls = isAdminConfigured() ? await signedViewUrls(createAdminClient(), (items ?? []).map((i) => i.storage_path).filter(Boolean) as string[], 3600) : new Map<string, string>();
  const names = Object.fromEntries(workspaces.map((w) => [w.id, w.name]));

  return (
    <div>
      <PageHeader title="Library" meta="Sound effects, film burns, LUTs, fonts and more. Pick them per video, or let Claude choose from here." />
      <nav className="-mx-4 mb-5 flex gap-1.5 overflow-x-auto px-4">
        {TABS.map(([t, label]) => (
          <Link key={t} href={`/library?kind=${t}`} className={`press shrink-0 rounded-full px-4 py-2 text-sm ${t === kind ? "bg-bone font-semibold text-ink" : "border border-rule text-mist"}`}>{label}</Link>
        ))}
      </nav>

      <Disclosure label="+ Add to library" initiallyOpen={!(items ?? []).length}>
        <LibraryAdd workspaces={workspaces.map((w) => ({ id: w.id, name: w.name }))} defaultKind={kind} />
      </Disclosure>

      <ul className="mt-6 grid gap-2">
        {(items ?? []).map((i) => {
          const src = i.storage_path ? urls.get(i.storage_path) : null;
          return (
            <li key={i.id}>
              <details className="rounded-2xl border border-rule p-4">
                <summary className="flex cursor-pointer list-none items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{i.name}</span>
                    <span className="block truncate text-xs text-ash">
                      {i.workspace_id ? `Only ${names[i.workspace_id] ?? "client"}` : "All clients"} · {i.storage_path ? "uploaded" : i.url ? "link" : "on the PC"}
                      {i.notes ? ` · ${i.notes}` : ""}
                    </span>
                  </span>
                  <span className={`shrink-0 text-xs ${i.sync_error ? "text-danger" : i.synced_path ? "text-success" : "text-ash"}`}>{i.sync_error ? "problem" : i.synced_path ? "ready" : "syncing"}</span>
                </summary>
                {src && kind === "sfx" ? <audio controls src={src} className="mt-3 w-full" /> : null}
                {i.url ? <a href={i.url} target="_blank" rel="noopener noreferrer" className="mt-2 block truncate text-sm text-mist underline">{i.url}</a> : null}
                {i.local_path ? <p className="mt-2 break-all text-xs text-ash">{i.local_path}</p> : null}
                {i.sync_error ? <p className="mt-2 text-sm text-danger">{i.sync_error}</p> : i.synced_path ? <p className="mt-2 break-all text-xs text-ash">Editor copy: {i.synced_path}</p> : null}
                <ActionForm action={updateLibraryItem} className="mt-3 grid gap-2">
                  <input type="hidden" name="id" value={i.id} />
                  <input type="hidden" name="kind" value={i.kind} />
                  <input name="name" defaultValue={i.name} className="field" />
                  <input name="notes" defaultValue={i.notes ?? ""} placeholder="When to use it" className="field" />
                  <select name="workspace" defaultValue={i.workspace_id ?? ""} className="field">
                    <option value="">All clients</option>
                    {workspaces.map((w) => <option key={w.id} value={w.id}>Only {w.name}</option>)}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <SubmitButton variant="ghost" name="intent" value="save">Save</SubmitButton>
                    <SubmitButton variant="ghost" name="intent" value="remove" className="border-0 text-ash">Remove</SubmitButton>
                  </div>
                </ActionForm>
              </details>
            </li>
          );
        })}
      </ul>
      {!(items ?? []).length ? <div className="mt-4"><EmptyState title="Nothing here yet." body="Add files above. Claude also keeps using the CapCut pack and the kit's own sounds when nothing here fits." /></div> : null}
    </div>
  );
}
