"use client";

import { useActionState, useCallback, useRef, useState } from "react";
import { ReviewPlayer, type Mark } from "@/components/review-player";
import { Sheet } from "@/components/sheet";
import { FormMessage, SubmitButton } from "@/components/form";
import { formatTimestamp } from "@/lib/domain/feedback";
import type { ActionState } from "@/lib/forms";
import { addFeedback, decide } from "./actions";

type Feedback = { id: string; body: string; at_seconds: number | null; reference_url: string | null; author_label: string | null; internal: boolean; created_at: string };

/**
 * Phone review: watch, tap "Note at 0:12", type, done. Four big decisions sit under the thumb.
 * Notes become structured editor instructions when "Needs changes" is sent.
 */
export function ReviewPanel({
  jobId,
  versionId,
  src,
  feedback,
  canDecide,
  stage,
  clientReview,
}: {
  jobId: string;
  versionId: string | null;
  src: string | null;
  feedback: Feedback[];
  canDecide: boolean;
  stage: "agency" | "client" | null;
  clientReview: boolean;
}) {
  const time = useRef(0);
  const [shown, setShown] = useState(0);
  const onTime = useCallback((t: number) => {
    time.current = t;
    setShown(t);
  }, []);
  const [noteAt, setNoteAt] = useState<number | null>(null);
  const [sheet, setSheet] = useState<null | "note" | "changes" | "reject" | "rerecord">(null);
  const [noteState, noteAction] = useActionState(addFeedback, {} as ActionState);
  const [decideState, decideAction] = useActionState(decide, {} as ActionState);
  const marks: Mark[] = feedback.filter((f) => f.at_seconds !== null).map((f) => ({ id: f.id, at: Number(f.at_seconds), body: f.body, author: f.author_label }));

  return (
    <div>
      {src ? <ReviewPlayer src={src} marks={marks} onTime={onTime} /> : <div className="grid aspect-[9/16] max-h-[60svh] place-items-center rounded-3xl border border-dashed border-rule text-sm text-ash">No edit yet</div>}

      {src ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => { setNoteAt(time.current); setSheet("note"); }} className="press h-12 rounded-full border border-rule-strong text-sm font-semibold">
            Note at {formatTimestamp(shown)}
          </button>
          <button type="button" onClick={() => { setNoteAt(null); setSheet("note"); }} className="press h-12 rounded-full border border-rule text-sm text-mist">
            General note
          </button>
        </div>
      ) : null}

      {canDecide ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <form action={decideAction} className="col-span-2">
            <input type="hidden" name="job" value={jobId} />
            <SubmitButton name="decision" value="approve" pending="Approving…" haptic="success" className="h-14 w-full text-base">
              {clientReview && stage === "agency" ? "Approve & send to client" : "Approve"}
            </SubmitButton>
          </form>
          <button type="button" onClick={() => setSheet("changes")} className="press h-12 rounded-full border border-attention/60 text-sm font-semibold text-attention">Fix it (tell Claude why)</button>
          <button type="button" onClick={() => setSheet("rerecord")} className="press h-12 rounded-full border border-rule-strong text-sm">Re-record</button>
          <button type="button" onClick={() => setSheet("reject")} className="press col-span-2 h-11 rounded-full text-sm text-danger">Delete</button>
        </div>
      ) : null}
      <div className="mt-3">
        <FormMessage state={decideState} />
      </div>

      {feedback.length ? (
        <ul className="mt-6 grid gap-2">
          {feedback.map((f) => (
            <li key={f.id} className="rounded-2xl border border-rule px-4 py-3 text-sm">
              <div className="mb-1 flex items-center gap-2 text-xs text-ash">
                {f.at_seconds !== null ? <span className="tabular rounded bg-attention/15 px-1.5 py-0.5 text-attention">{formatTimestamp(Number(f.at_seconds))}</span> : null}
                <span>{f.author_label ?? "Note"}</span>
                {f.internal ? <span className="rounded border border-rule px-1">internal</span> : null}
              </div>
              <p className="whitespace-pre-wrap">{f.body}</p>
              {f.reference_url ? <a href={f.reference_url} target="_blank" rel="noopener noreferrer" className="mt-1 block truncate text-mist underline underline-offset-4">{f.reference_url}</a> : null}
            </li>
          ))}
        </ul>
      ) : null}

      <Sheet open={sheet === "note"} onClose={() => setSheet(null)} title={noteAt !== null ? `Note at ${formatTimestamp(noteAt)}` : "General note"}>
        <form action={async (fd) => { await noteAction(fd); setSheet(null); }} className="grid gap-3">
          <input type="hidden" name="job" value={jobId} />
          <input type="hidden" name="version" value={versionId ?? ""} />
          {noteAt !== null ? <input type="hidden" name="at" value={noteAt.toFixed(2)} /> : null}
          <textarea name="body" autoFocus className="field" placeholder={noteAt !== null ? "What should change here?" : "What should change overall? Start with “Keep …” for things to keep."} />
          <input name="url" type="url" inputMode="url" className="field" placeholder="Reference link (optional)" />
          <label className="flex items-center gap-2 text-sm text-mist">
            <input type="checkbox" name="internal" className="accent-bone" /> Internal (client never sees it)
          </label>
          <SubmitButton pending="Adding…">Add note</SubmitButton>
        </form>
      </Sheet>
      <FormMessage state={noteState.error ? noteState : undefined} />

      <Sheet open={sheet === "changes"} onClose={() => setSheet(null)} title="What should Claude fix?">
        <form action={async (fd) => { await decideAction(fd); setSheet(null); }} className="grid gap-3">
          <input type="hidden" name="job" value={jobId} />
          <p className="text-sm text-mist">
            {marks.length} timed note{marks.length === 1 ? "" : "s"} and {feedback.length - marks.length} general note{feedback.length - marks.length === 1 ? "" : "s"} go to the editor as one instruction list.
          </p>
          <textarea name="note" className="field" placeholder="Anything else? (optional)" />
          <label className="flex items-center gap-2 text-xs text-attention">
            <input type="checkbox" name="overage" className="accent-bone" /> Allow beyond the revision allowance
          </label>
          <SubmitButton name="decision" value="changes_requested" pending="Sending…">Send to editor</SubmitButton>
        </form>
      </Sheet>

      <Sheet open={sheet === "rerecord"} onClose={() => setSheet(null)} title="Ask for a re-record">
        <form action={async (fd) => { await decideAction(fd); setSheet(null); }} className="grid gap-3">
          <input type="hidden" name="job" value={jobId} />
          <textarea name="note" required className="field" placeholder="What should be filmed again, and how?" />
          <SubmitButton name="decision" value="rerecord" pending="Sending…">Request re-record</SubmitButton>
        </form>
      </Sheet>

      <Sheet open={sheet === "reject"} onClose={() => setSheet(null)} title="Delete this video?">
        <form action={async (fd) => { await decideAction(fd); setSheet(null); }} className="grid gap-3">
          <input type="hidden" name="job" value={jobId} />
          <p className="text-sm text-mist">It is moved to the archive (restorable). Tell Claude why so the next edits avoid it.</p>
          <textarea name="note" className="field" placeholder="Why? (optional, Claude learns from it)" />
          <SubmitButton variant="danger" name="decision" value="rejected" pending="Deleting…">Delete</SubmitButton>
        </form>
      </Sheet>
    </div>
  );
}
