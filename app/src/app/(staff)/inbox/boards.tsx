"use client";

import Link from "@/components/link";
import { useActionState, useMemo, useState } from "react";
import { MediaThumb } from "@/components/media-thumb";
import { Sheet } from "@/components/sheet";
import { FormMessage, SubmitButton } from "@/components/form";
import { PLATFORM_LABEL, type Platform } from "@/lib/domain/types";
import { formatAgo } from "@/lib/format";
import type { ActionState } from "@/lib/forms";
import type { JobRow } from "@/lib/data";
import type { MediaCard } from "./page";
import { approveJobs, groupIntoJob, markMedia, rejectJobs } from "./actions";

/** Loose uploads: select clips → one video, reference only, reject, or ask for a re-record. */
export function LooseMediaBoard({ media, workspaceNames, platformsByWs }: { media: MediaCard[]; workspaceNames: Record<string, string>; platformsByWs: Record<string, string[]> }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [sheet, setSheet] = useState<"group" | "mark" | null>(null);
  const [groupState, groupAction] = useActionState(groupIntoJob, {} as ActionState);
  const [markState, markAction] = useActionState(markMedia, {} as ActionState);
  const byWs = useMemo(() => {
    const map = new Map<string, MediaCard[]>();
    for (const m of media) map.set(m.workspace_id, [...(map.get(m.workspace_id) ?? []), m]);
    return [...map.entries()];
  }, [media]);
  const selWs = new Set(media.filter((m) => selected.includes(m.id)).map((m) => m.workspace_id));
  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const ws = [...selWs][0];

  return (
    <div>
      {byWs.map(([wsId, list]) => (
        <div key={wsId} className="mb-5">
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-sm font-medium">{workspaceNames[wsId]}</p>
            <button type="button" onClick={() => setSelected(list.map((m) => m.id))} className="text-xs text-mist hover:text-bone">Select all {list.length}</button>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {list.map((m) => (
              <MediaThumb key={m.id} media={m} selected={selected.includes(m.id)} onToggle={() => toggle(m.id)} />
            ))}
          </div>
          <p className="mt-1.5 text-xs text-ash">Latest {formatAgo(list[0]?.created_at)}</p>
        </div>
      ))}

      {selected.length ? (
        <div className="pb-safe fixed inset-x-0 bottom-16 z-40 border-t border-rule bg-coal/95 px-4 py-3 backdrop-blur md:bottom-0 md:left-60">
          <div className="mx-auto flex max-w-3xl items-center gap-2">
            <span className="tabular mr-auto text-sm">{selected.length} selected</span>
            <button type="button" onClick={() => setSelected([])} className="press h-10 rounded-full px-3 text-sm text-mist">Clear</button>
            <button type="button" onClick={() => setSheet("mark")} className="press h-10 rounded-full border border-rule-strong px-4 text-sm">Mark</button>
            <button type="button" disabled={selWs.size !== 1} onClick={() => setSheet("group")} className="press h-10 rounded-full bg-bone px-4 text-sm font-semibold text-ink disabled:opacity-40">Make video</button>
          </div>
          {selWs.size > 1 ? <p className="mx-auto mt-1 max-w-3xl text-xs text-attention">Select clips from one client to make a video.</p> : null}
        </div>
      ) : null}

      <Sheet open={sheet === "group"} onClose={() => setSheet(null)} title={`One video from ${selected.length} file${selected.length === 1 ? "" : "s"}`}>
        <form action={async (fd) => { await groupAction(fd); setSelected([]); }} className="grid gap-4">
          {selected.map((id) => <input key={id} type="hidden" name="media" value={id} />)}
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Title</span>
            <input name="title" required className="field" placeholder="What is this video?" />
          </label>
          <div className="flex gap-2">
            {(["short", "long"] as const).map((f) => (
              <label key={f}>
                <input type="radio" name="form" value={f} defaultChecked={f === "short"} className="sr-only" />
                <span className="chip press">{f === "short" ? "Short-form" : "Long-form"}</span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {(platformsByWs[ws] ?? []).map((p) => (
              <label key={p}>
                <input type="checkbox" name="platforms" value={p} defaultChecked={p === "instagram" || p === "tiktok"} className="sr-only" />
                <span className="chip press">{PLATFORM_LABEL[p as Platform] ?? p}</span>
              </label>
            ))}
          </div>
          <select name="priority" defaultValue="normal" className="field">
            {["low", "normal", "high", "urgent"].map((p) => <option key={p} value={p}>Priority: {p}</option>)}
          </select>
          <textarea name="note" className="field" placeholder="Notes for the editor (optional)" />
          <div className="grid grid-cols-2 gap-2">
            <SubmitButton variant="ghost" name="start" value="later">Save for later</SubmitButton>
            <SubmitButton name="start" value="now" pending="Sending…">Edit now</SubmitButton>
          </div>
          <FormMessage state={groupState} />
        </form>
      </Sheet>

      <Sheet open={sheet === "mark"} onClose={() => setSheet(null)} title={`Mark ${selected.length} file${selected.length === 1 ? "" : "s"}`}>
        <form action={async (fd) => { await markAction(fd); setSelected([]); }} className="grid gap-3">
          {selected.map((id) => <input key={id} type="hidden" name="media" value={id} />)}
          <textarea name="note" className="field" placeholder="Note (sent to the client for re-records)" />
          <SubmitButton variant="ghost" name="mark" value="reference_only">Reference only</SubmitButton>
          <SubmitButton variant="ghost" name="mark" value="rerecord_requested">Ask for a re-record</SubmitButton>
          <SubmitButton variant="danger" name="mark" value="rejected">Reject (unusable)</SubmitButton>
          <FormMessage state={markState} />
        </form>
      </Sheet>
      <FormMessage state={groupState.success || groupState.error ? groupState : markState} />
    </div>
  );
}

type PendingJob = JobRow & { workspaceName: string; media: MediaCard[]; reasons: string[]; agencyNotes: string | null };

/** Jobs waiting for a go: preview clips, approve one or many, or archive. */
export function PendingJobsBoard({ jobs }: { jobs: PendingJob[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [approveState, approveAction] = useActionState(approveJobs, {} as ActionState);
  const [rejectState, rejectAction] = useActionState(rejectJobs, {} as ActionState);
  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const overLimit = jobs.some((j) => selected.includes(j.id) && j.reasons.some((r) => /limit|Blocked|owner/i.test(r)));

  return (
    <div>
      <ul className="grid gap-3">
        {jobs.map((j) => (
          <li key={j.id} className={`rounded-2xl border p-3 ${selected.includes(j.id) ? "border-bone" : "border-rule"}`}>
            <div className="flex items-start gap-3">
              <button type="button" onClick={() => toggle(j.id)} aria-pressed={selected.includes(j.id)} aria-label={`Select ${j.title}`} className={`press mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border text-xs ${selected.includes(j.id) ? "border-bone bg-bone text-ink" : "border-rule-strong"}`}>
                {selected.includes(j.id) ? "✓" : ""}
              </button>
              <Link href={`/jobs/${j.id}`} className="min-w-0 flex-1">
                <p className="truncate font-medium">{j.title}</p>
                <p className="text-sm text-ash">
                  {j.workspaceName} · {j.form === "short" ? "Short" : "Long"} · {j.media.length} file{j.media.length === 1 ? "" : "s"} · {j.source === "client" ? "client upload" : formatAgo(j.created_at)}
                </p>
              </Link>
            </div>
            {j.reasons.length ? <p className="mt-2 text-xs text-attention">{j.reasons.join(" ")}</p> : null}
            {j.media.length ? (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {j.media.map((m) => (
                  <div key={m.id} className="w-20 shrink-0">
                    <MediaThumb media={m} />
                  </div>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {selected.length ? (
        <div className="pb-safe fixed inset-x-0 bottom-16 z-40 border-t border-rule bg-coal/95 px-4 py-3 backdrop-blur md:bottom-0 md:left-60">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2">
            <span className="tabular mr-auto text-sm">{selected.length} selected</span>
            <form action={async (fd) => { await rejectAction(fd); setSelected([]); }}>
              {selected.map((id) => <input key={id} type="hidden" name="job" value={id} />)}
              <SubmitButton variant="ghost" pending="…" className="h-10">Archive</SubmitButton>
            </form>
            <form action={async (fd) => { await approveAction(fd); setSelected([]); }} className="flex items-center gap-2">
              {selected.map((id) => <input key={id} type="hidden" name="job" value={id} />)}
              {overLimit ? (
                <label className="flex items-center gap-1.5 text-xs text-attention">
                  <input type="checkbox" name="overage" className="accent-bone" /> Over limit: allow
                </label>
              ) : null}
              <SubmitButton pending="Sending…" className="h-10">Approve & edit</SubmitButton>
            </form>
          </div>
        </div>
      ) : null}
      <div className="mt-3">
        <FormMessage state={approveState.success || approveState.error ? approveState : rejectState} />
      </div>
    </div>
  );
}
