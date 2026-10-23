"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Icon, type IconName } from "@/components/icons";
import { Sheet } from "@/components/sheet";
import { FormMessage } from "@/components/form";
import { PlatformTag, PostPill } from "@/components/ui";
import type { CalendarPost } from "@/components/calendar";
import type { ActionState } from "@/lib/forms";
import { approvePosts, postQuickAction } from "./actions";

const QUICK: { intent: string; label: string; icon: IconName }[] = [
  { intent: "next_slot", label: "Next free slot", icon: "spark" },
  { intent: "shift_60", label: "1 hour later", icon: "clock" },
  { intent: "shift_1440", label: "Next day", icon: "calendar" },
  { intent: "asap", label: "As soon as possible", icon: "bolt" },
];

function Quick({ intent, label, icon }: { intent: string; label: string; icon: IconName }) {
  const { pending, data } = useFormStatus();
  const mine = pending && data?.get("intent") === intent;
  return (
    <button type="submit" name="intent" value={intent} disabled={pending} data-haptic="select" className="press flex h-14 items-center gap-2.5 rounded-2xl border border-rule bg-char px-3.5 text-left text-sm disabled:opacity-50">
      <Icon name={icon} className={`size-4 shrink-0 text-mist ${mine ? "animate-spin" : ""}`} />
      <span className="leading-tight">{mine ? "Moving…" : label}</span>
    </button>
  );
}

function Primary({ intent, children, tone = "solid" }: { intent: string; children: ReactNode; tone?: "solid" | "ghost" | "danger" }) {
  const { pending, data } = useFormStatus();
  const mine = pending && data?.get("intent") === intent;
  const style = tone === "solid" ? "bg-bone text-ink" : tone === "danger" ? "border border-danger/60 text-danger" : "border border-rule-strong";
  return (
    <button type="submit" name="intent" value={intent} disabled={pending} data-haptic={tone === "danger" ? "warning" : "select"} className={`press flex h-12 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold disabled:opacity-50 ${style}`}>
      {mine ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
      {children}
    </button>
  );
}

/**
 * Tapping a post on the calendar opens this sheet: what it is, when it goes out, and one-tap
 * changes (next free slot, +1 hour, next day, ASAP, exact time), approve & schedule, or don't post.
 */
export function PostSheet({ post, tz, whenLocal, editable, children }: { post: CalendarPost; tz: string; whenLocal: string | null; editable: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [state, action] = useActionState(postQuickAction, {} as ActionState);
  const when = new Date(post.at);

  // FormMessage plays the success / error buzz; a moved post closes the sheet shortly after.
  useEffect(() => {
    if (!state.success) return;
    const t = setTimeout(() => setOpen(false), 1400);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setConfirmCancel(false);
          setOpen(true);
        }}
        className="press flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left"
      >
        {children}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={post.title || "Post"}>
        <div className="mb-5 flex items-center gap-4">
          <div className="grid h-24 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-graphite">
            {post.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.thumb} alt="" className="size-full object-cover" />
            ) : (
              <Icon name="film" className="size-5 text-ash" />
            )}
          </div>
          <div className="min-w-0">
            <p className="tabular text-2xl font-semibold leading-tight tracking-tight">{when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })}</p>
            <p className="text-sm text-mist">{when.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: tz })}</p>
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-ash">
              <PlatformTag platform={post.platform} />
              <PostPill status={post.status} />
              {post.workspaceName ? <span>{post.workspaceName}</span> : null}
            </p>
          </div>
        </div>

        {editable ? (
          <form action={action} className="grid gap-4">
            <input type="hidden" name="post" value={post.id} />
            <div className="grid grid-cols-2 gap-2">
              {QUICK.map((q) => (
                <Quick key={q.intent} {...q} />
              ))}
            </div>
            <div className="flex gap-2">
              <input type="datetime-local" name="when" defaultValue={whenLocal ?? ""} aria-label="Exact time" className="field h-12 min-w-0 flex-1" />
              <Primary intent="move" tone="ghost">Set</Primary>
            </div>
            <Primary intent="approve">
              <Icon name="send" className="size-4" /> {post.status === "failed" ? "Retry in Buffer" : "Approve & schedule"}
            </Primary>
            {confirmCancel ? (
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setConfirmCancel(false)} className="press h-12 rounded-full border border-rule text-sm">
                  Keep it
                </button>
                <Primary intent="cancel" tone="danger">Yes, don&apos;t post</Primary>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmCancel(true)} className="press h-10 text-sm text-ash hover:text-danger">
                Don&apos;t post this one
              </button>
            )}
            <FormMessage state={state} />
          </form>
        ) : (
          <p className="rounded-2xl border border-rule px-4 py-3 text-sm text-mist">
            {post.status === "published" ? "Already posted." : post.status === "scheduled" ? "Scheduled in Buffer. To change it, edit it in Buffer." : "This post can't be changed here."}
          </p>
        )}
        <Link href={post.href} className="press mt-3 flex h-12 items-center justify-center gap-2 rounded-full border border-rule-strong text-sm font-semibold">
          <Icon name="film" className="size-4" /> Open video &amp; caption
        </Link>
      </Sheet>
    </>
  );
}

/** "N posts need your approval" bar above the calendar, with a confirm step. */
export function ApproveAllBar({ ids }: { ids: string[] }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(approvePosts, {} as ActionState);
  if (!ids.length && !state.success) return null;
  return (
    <div className="rise-in mb-4 flex items-center gap-3 rounded-2xl border border-attention/40 bg-attention/[0.06] px-4 py-3">
      <span className="tabular grid size-9 shrink-0 place-items-center rounded-full bg-attention/15 text-sm font-semibold text-attention">{ids.length}</span>
      <p className="min-w-0 flex-1 text-sm">{state.success ?? (ids.length === 1 ? "post needs your approval" : "posts need your approval")}</p>
      {ids.length ? (
        <button type="button" onClick={() => setOpen(true)} className="press h-10 shrink-0 rounded-full bg-bone px-4 text-sm font-semibold text-ink">
          Approve all
        </button>
      ) : null}
      <Sheet open={open} onClose={() => setOpen(false)} title={`Approve ${ids.length} ${ids.length === 1 ? "post" : "posts"}?`}>
        <p className="mb-4 text-sm text-mist">Each one is approved with its current caption and time, then sent to Buffer. Posts with a problem (no channel, no time) stay here and say why.</p>
        <form action={action} className="grid gap-2">
          {ids.map((id) => (
            <input key={id} type="hidden" name="post" value={id} />
          ))}
          <Primary intent="approve_all">
            <Icon name="check" className="size-4" /> Approve &amp; schedule all
          </Primary>
          <button type="button" onClick={() => setOpen(false)} className="press h-11 text-sm text-mist">
            Not yet
          </button>
          <FormMessage state={state} />
        </form>
      </Sheet>
    </div>
  );
}
