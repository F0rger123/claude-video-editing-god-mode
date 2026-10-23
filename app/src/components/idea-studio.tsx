"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { ideaRequestStatus, requestContentIdeas } from "@/app/actions/scripts";
import { Icon } from "@/components/icons";
import { Sheet } from "@/components/sheet";
import { SubmitButton } from "@/components/form";
import { IDEA_STYLES } from "@/lib/domain/scripts";
import { haptic } from "@/lib/haptics";

type Pending = { id: string; form: string; style: string; status: string } | null;

const STEPS = ["Reading what you liked and passed", "Finding hooks that stop the scroll", "Writing the scripts", "Planning shots and captions"];

/** Pulsing "Claude is thinking" loader: rings breathe outward, the status line cycles. */
export function IdeaLoader({ arrived, total, label }: { arrived: number; total: number; label?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % STEPS.length), 2200);
    return () => clearInterval(t);
  }, []);
  return (
    <div role="status" aria-live="polite" className="relative overflow-hidden rounded-3xl border border-rule bg-coal px-5 py-8 text-center">
      <div className="relative mx-auto mb-5 grid size-24 place-items-center">
        <span className="pulse-ring absolute inset-0 rounded-full border border-bone/40" />
        <span className="pulse-ring absolute inset-0 rounded-full border border-bone/30 [animation-delay:600ms]" />
        <span className="pulse-ring absolute inset-0 rounded-full border border-bone/20 [animation-delay:1200ms]" />
        <span className="pulse-core grid size-14 place-items-center rounded-full bg-bone text-ink">
          <Icon name="spark" className="size-7" />
        </span>
      </div>
      <p className="font-semibold">{label ?? "Claude is writing your ideas"}</p>
      <p key={i} className="fade-swap mt-1 text-sm text-mist">{STEPS[i]}…</p>
      <div className="mx-auto mt-5 flex max-w-[12rem] justify-center gap-1.5">
        {Array.from({ length: total }, (_, n) => (
          <span key={n} className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${n < arrived ? "bg-bone" : "bg-graphite"}`} />
        ))}
      </div>
      <p className="mt-2 text-xs text-ash">{arrived ? `${arrived} of ${total} ready — swipe them below` : "First idea in a few seconds"}</p>
    </div>
  );
}

function FormCard({ form, onClick, disabled, compact }: { form: "short" | "long"; onClick: () => void; disabled: boolean; compact?: boolean }) {
  const short = form === "short";
  if (compact) {
    // Slim version above the swipe deck, so the deck still fits on one screen.
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={`press flex h-14 items-center gap-3 rounded-2xl px-3 text-left disabled:opacity-40 ${short ? "bg-bone text-ink" : "border border-rule-strong bg-ink text-bone"}`}
      >
        <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${short ? "bg-ink text-bone" : "bg-bone text-ink"}`}>
          <Icon name="spark" className="size-4" />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block text-[15px] font-semibold tracking-tight">{short ? "Short-form" : "Long-form"}</span>
          <span className="block text-[11px] opacity-60">{short ? "New reel ideas" : "New video ideas"}</span>
        </span>
      </button>
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`press group relative flex min-h-40 flex-col justify-between overflow-hidden rounded-[28px] p-5 text-left disabled:opacity-40 ${short ? "bg-bone text-ink" : "border border-rule-strong bg-ink text-bone"}`}
    >
      <span className={`grid size-11 place-items-center rounded-2xl ${short ? "bg-ink text-bone" : "bg-bone text-ink"}`}>
        <Icon name="spark" className="size-5" />
      </span>
      <span>
        <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] opacity-60">{short ? "15–60 s · 9:16" : "6–12 min · 16:9"}</span>
        <span className="mt-1 block text-2xl font-semibold leading-none tracking-tight">{short ? "Short-form" : "Long-form"}</span>
        <span className="mt-1 block text-sm opacity-70">{short ? "Hook · script · shots" : "Title · outline · B-roll"}</span>
      </span>
      <span aria-hidden className={`absolute right-4 top-4 grid size-9 place-items-center rounded-full transition-transform duration-300 group-active:translate-x-1 ${short ? "bg-ink/10" : "bg-bone/10"}`}>
        <Icon name="chevron" className="size-4" />
      </span>
    </button>
  );
}

/**
 * The two big cards: "Short-form" and "Long-form" ideas. Pick a style (or let Claude), optionally a
 * topic, and Claude writes complete ideas; each one appears in the deck below the moment it is done.
 */
export function IdeaStudio({ workspaceId, pending, quota, perRequest = 5, compact = false }: { workspaceId: string; pending: Pending; quota?: { used: number; limit: number } | null; perRequest?: number; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState<"short" | "long" | null>(null);
  const [style, setStyle] = useState<string>("Claude picks");
  const [state, action] = useActionState(requestContentIdeas, {});
  const [watching, setWatching] = useState<string | null>(pending?.id ?? null);
  const [arrived, setArrived] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const left = quota ? Math.max(0, quota.limit - quota.used) : null;

  useEffect(() => {
    if (!state.requestId) return;
    const id = requestAnimationFrame(() => {
      setWatching(state.requestId!);
      setArrived(0);
      setFailed(null);
      setOpen(null);
    });
    return () => cancelAnimationFrame(id);
  }, [state.requestId]);

  // Poll quickly; refresh the deck each time new ideas land so they appear one by one.
  useEffect(() => {
    if (!watching) return;
    let stop = false;
    let seen = 0;
    const tick = async () => {
      const r = await ideaRequestStatus(watching);
      if (stop) return;
      if ((r.count ?? 0) > seen) {
        seen = r.count ?? 0;
        setArrived(seen);
        haptic("tap");
        router.refresh();
      }
      if (r.status === "done" || r.status === "failed" || r.status === "unknown") {
        setWatching(null);
        if (r.status === "failed") setFailed(r.error ?? "Claude could not write that batch. Try again.");
        else haptic("success");
        router.refresh();
      } else setTimeout(tick, 1500);
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [watching, router]);

  return (
    <div className={compact ? "mb-4" : "mb-6"}>
      {watching ? (
        <IdeaLoader arrived={arrived} total={perRequest} />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <FormCard form="short" compact={compact} disabled={left === 0} onClick={() => setOpen("short")} />
          <FormCard form="long" compact={compact} disabled={left === 0} onClick={() => setOpen("long")} />
        </div>
      )}
      {left !== null && !watching ? <p className="mt-2 text-xs text-ash">{left} of {quota!.limit} idea requests left this month.</p> : null}
      {failed ? <p role="alert" className="mt-3 rounded-2xl border border-danger/40 px-4 py-3 text-sm text-danger">{failed}</p> : null}
      {state.error ? <p role="alert" className="mt-3 text-sm text-danger">{state.error}</p> : null}

      <Sheet open={Boolean(open)} onClose={() => setOpen(null)} title={open === "long" ? "Long-form ideas" : "Short-form ideas"}>
        <form action={action} className="grid gap-5">
          <input type="hidden" name="workspace" value={workspaceId} />
          <input type="hidden" name="form" value={open ?? "short"} />
          <input type="hidden" name="style" value={style} />
          <div>
            <p className="mb-2 text-sm font-medium">Style</p>
            <div className="flex flex-wrap gap-2">
              {IDEA_STYLES.map((s) => (
                <button key={s} type="button" onClick={() => setStyle(s)} className={`chip press ${style === s ? "!border-bone !bg-bone !text-ink" : ""}`}>{s}</button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Topic <span className="font-normal text-ash">optional</span></span>
            <input name="topic" className="field" placeholder="e.g. why cheap websites cost more" maxLength={500} />
          </label>
          <SubmitButton pending="Starting…" className="h-14 text-base" haptic="select">
            <Icon name="spark" className="size-5" /> Write {perRequest} ideas
          </SubmitButton>
        </form>
      </Sheet>
    </div>
  );
}
