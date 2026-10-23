import type { JobStatus } from "@/lib/domain/types";

/**
 * Where a video is in the pipeline, as a simple track. The editor reports Queued → Editing →
 * Rendering; Review onward comes from people and Buffer.
 */
const TRACK: { key: string; label: string; clientLabel: string; statuses: JobStatus[] }[] = [
  { key: "in", label: "Received", clientLabel: "Received", statuses: ["incoming", "pending_approval"] },
  { key: "queue", label: "Queued", clientLabel: "Queued", statuses: ["queued"] },
  { key: "edit", label: "Editing", clientLabel: "Editing", statuses: ["editing"] },
  { key: "render", label: "Rendering", clientLabel: "Finishing", statuses: ["rendering"] },
  { key: "review", label: "Review", clientLabel: "Review", statuses: ["review", "needs_changes"] },
  { key: "ok", label: "Approved", clientLabel: "Approved", statuses: ["approved"] },
  { key: "sched", label: "Scheduled", clientLabel: "Scheduled", statuses: ["scheduled", "publishing"] },
  { key: "live", label: "Published", clientLabel: "Live", statuses: ["published"] },
];

export function ProgressSteps({ status, client = false, note }: { status: JobStatus; client?: boolean; note?: string | null }) {
  const at = TRACK.findIndex((t) => t.statuses.includes(status));
  const failed = status === "failed";
  const archived = status === "archived";
  return (
    <div className="mb-6">
      <ol className="flex gap-1" aria-label="Progress">
        {TRACK.map((t, i) => {
          const done = at > i;
          const current = at === i;
          return (
            <li key={t.key} className="min-w-0 flex-1">
              <div className={`h-1.5 rounded-full ${failed && current ? "bg-danger" : done ? "bg-bone" : current ? "animate-pulse bg-bone motion-reduce:animate-none" : "bg-graphite"}`} />
              <p className={`mt-1.5 truncate text-[10px] ${current ? "font-semibold text-bone" : done ? "text-mist" : "text-ash"}`}>{client ? t.clientLabel : t.label}</p>
            </li>
          );
        })}
      </ol>
      {failed ? <p className="mt-2 text-sm text-danger">{client ? "We hit a problem and are looking at it." : "Failed. See the note below, then retry."}</p> : null}
      {archived ? <p className="mt-2 text-sm text-ash">Archived.</p> : null}
      {status === "needs_changes" ? <p className="mt-2 text-sm text-attention">Changes requested.</p> : null}
      {note ? <p className="mt-2 text-sm text-mist">{note}</p> : null}
    </div>
  );
}
