"use client";

import { AGENCY_NAME } from "@/lib/brand";
import { useActionState, useCallback, useState } from "react";
import { ReviewPlayer, type Mark } from "@/components/review-player";
import { Sheet } from "@/components/sheet";
import { FormMessage, SubmitButton } from "@/components/form";
import { PlatformTag, PostPill } from "@/components/ui";
import { formatTimestamp } from "@/lib/domain/feedback";
import { formatWhen } from "@/lib/format";
import type { ActionState } from "@/lib/forms";
import { clientApproveCaption, clientComment, clientDecide } from "../../actions";

type Feedback = { id: string; body: string; at_seconds: number | null; reference_url: string | null; author_label: string | null; created_at: string };

export function ClientReview({ versionId, src, feedback, canComment, canApprove, canRequestChanges }: { versionId: string; src: string | null; feedback: Feedback[]; canComment: boolean; canApprove: boolean; canRequestChanges: boolean }) {
  const [t, setT] = useState(0);
  const onTime = useCallback((x: number) => setT(x), []);
  const [sheet, setSheet] = useState<null | { at: number | null } | "changes">(null);
  const [commentState, commentAction] = useActionState(clientComment, {} as ActionState);
  const [decideState, decideAction] = useActionState(clientDecide, {} as ActionState);
  const marks: Mark[] = feedback.filter((f) => f.at_seconds !== null).map((f) => ({ id: f.id, at: Number(f.at_seconds), body: f.body, author: f.author_label }));
  const noteAt = sheet && sheet !== "changes" ? sheet.at : null;

  return (
    <div>
      {src ? <ReviewPlayer src={src} marks={marks} onTime={onTime} /> : null}
      {canComment ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setSheet({ at: t })} className="press h-12 rounded-full border border-rule-strong text-sm font-semibold">Comment at {formatTimestamp(t)}</button>
          <button type="button" onClick={() => setSheet({ at: null })} className="press h-12 rounded-full border border-rule text-sm text-mist">General comment</button>
        </div>
      ) : null}
      {canApprove || canRequestChanges ? (
        <div className="mt-4 grid gap-2">
          {canApprove ? (
            <form action={decideAction}>
              <input type="hidden" name="version" value={versionId} />
              <SubmitButton name="decision" value="approved" pending="Approving…" haptic="success" className="h-14 w-full text-base">Approve</SubmitButton>
            </form>
          ) : null}
          {canRequestChanges ? <button type="button" onClick={() => setSheet("changes")} className="press h-12 rounded-full border border-attention/60 text-sm font-semibold text-attention">Request changes</button> : null}
        </div>
      ) : null}
      <div className="mt-3"><FormMessage state={decideState.success || decideState.error ? decideState : commentState} /></div>

      {feedback.length ? (
        <ul className="mt-6 grid gap-2">
          {feedback.map((f) => (
            <li key={f.id} className="rounded-2xl border border-rule px-4 py-3 text-sm">
              <p className="mb-1 text-xs text-ash">
                {f.at_seconds !== null ? <span className="tabular mr-2 text-attention">{formatTimestamp(Number(f.at_seconds))}</span> : null}
                {f.author_label ?? "Comment"}
              </p>
              <p className="whitespace-pre-wrap">{f.body}</p>
              {f.reference_url ? <a href={f.reference_url} target="_blank" rel="noopener noreferrer" className="mt-1 block truncate text-mist underline">{f.reference_url}</a> : null}
            </li>
          ))}
        </ul>
      ) : null}

      <Sheet open={Boolean(sheet && sheet !== "changes")} onClose={() => setSheet(null)} title={noteAt !== null ? `Comment at ${formatTimestamp(noteAt)}` : "Comment"}>
        <form action={async (fd) => { await commentAction(fd); setSheet(null); }} className="grid gap-3">
          <input type="hidden" name="version" value={versionId} />
          {noteAt !== null ? <input type="hidden" name="at" value={noteAt.toFixed(2)} /> : null}
          <textarea name="body" required autoFocus className="field" placeholder="What would you like changed or kept?" />
          <input name="url" type="url" inputMode="url" className="field" placeholder="Example link (optional)" />
          <SubmitButton pending="Sending…">Add comment</SubmitButton>
        </form>
      </Sheet>
      <Sheet open={sheet === "changes"} onClose={() => setSheet(null)} title="Request changes">
        <form action={async (fd) => { await decideAction(fd); setSheet(null); }} className="grid gap-3">
          <input type="hidden" name="version" value={versionId} />
          <p className="text-sm text-mist">Your timed comments are included. Add a summary of what to change.</p>
          <textarea name="note" required className="field" placeholder="What should change?" />
          <SubmitButton name="decision" value="changes_requested" pending="Sending…">Send to {AGENCY_NAME}</SubmitButton>
        </form>
      </Sheet>
    </div>
  );
}

type Post = { id: string; platform: string; caption: string | null; hashtags: string[]; cta: string | null; title: string | null; scheduled_at: string | null; status: string; caption_approved: boolean };

export function ClientCaptions({ posts, canApprove, tz }: { posts: Post[]; canApprove: boolean; tz: string }) {
  const [state, action] = useActionState(clientApproveCaption, {} as ActionState);
  return (
    <div className="grid gap-3">
      {posts.map((p) => (
        <div key={p.id} className="rounded-2xl border border-rule p-4 text-sm">
          <div className="mb-2 flex items-center gap-2">
            <PlatformTag platform={p.platform} />
            <span className="text-ash">{formatWhen(p.scheduled_at, tz)}</span>
            <span className="ml-auto"><PostPill status={p.status} /></span>
          </div>
          {p.title ? <p className="font-medium">{p.title}</p> : null}
          <p className="whitespace-pre-wrap text-mist">{p.caption}</p>
          {p.cta ? <p className="mt-1">{p.cta}</p> : null}
          {p.hashtags.length ? <p className="mt-1 text-ash">{p.hashtags.join(" ")}</p> : null}
          {canApprove && p.status === "awaiting_approval" && !p.caption_approved ? (
            <form action={action} className="mt-3">
              <input type="hidden" name="post" value={p.id} />
              <SubmitButton variant="ghost" className="h-10 w-full">Approve caption</SubmitButton>
            </form>
          ) : null}
        </div>
      ))}
      <FormMessage state={state} />
    </div>
  );
}

