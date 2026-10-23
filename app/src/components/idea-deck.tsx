"use client";

import { AGENCY_NAME } from "@/lib/brand";
import { useEffect, useRef, useState, useTransition } from "react";
import { decideIdea } from "@/app/actions/scripts";
import { Icon } from "@/components/icons";
import { Sheet } from "@/components/sheet";
import { IdeaDetail } from "@/components/idea-detail";
import { haptic } from "@/lib/haptics";

export type Idea = { id: string; hook: string; script: string | null; angle: string | null; why: string | null; form: "short" | "long"; title?: string | null; style?: string | null; outline?: string | null; broll?: string | null; thumbnail_text?: string | null; caption?: string | null };

type Choice = "liked" | "passed" | "saved";
const PASS_REASONS = ["Not our audience", "Too salesy", "Done before", "Too negative", "Hard to film"];
const THRESHOLD = 100;

/**
 * Swipe deck. Drag right = like, left = pass (optionally say why), ★ = save to film. The card follows
 * the finger, shows LIKE / PASS stamps, then flies off. Undo brings back the last one. Ideas that
 * Claude finishes while you swipe slide in at the back of the pile.
 */
export function IdeaDeck({ ideas, canSwipe, onDecided }: { ideas: Idea[]; canSwipe: boolean; onDecided?: (idea: Idea, status: Choice | "new") => void }) {
  const [queue, setQueue] = useState(ideas);
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [flying, setFlying] = useState<null | "left" | "right" | "up">(null);
  const [expanded, setExpanded] = useState(false);
  const [askReason, setAskReason] = useState<Idea | null>(null);
  const [history, setHistory] = useState<Idea[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const origin = useRef<{ x: number; y: number } | null>(null);
  const seen = useRef(new Set(ideas.map((i) => i.id)));
  const card = queue[0];
  const total = queue.length + history.length;

  // New ideas from the server (streamed in while you swipe) join the back of the pile.
  useEffect(() => {
    const fresh = ideas.filter((i) => !seen.current.has(i.id));
    if (!fresh.length) return;
    fresh.forEach((i) => seen.current.add(i.id));
    const id = requestAnimationFrame(() => setQueue((q) => [...q, ...fresh]));
    return () => cancelAnimationFrame(id);
  }, [ideas]);

  function commit(idea: Idea, status: Choice, reason?: string) {
    haptic(status === "passed" ? "warning" : "success");
    setFlying(status === "liked" ? "right" : status === "passed" ? "left" : "up");
    setTimeout(() => {
      setQueue((q) => q.filter((i) => i.id !== idea.id));
      setHistory((h) => [idea, ...h].slice(0, 20));
      setFlying(null);
      setDx(0);
      setDy(0);
      setExpanded(false);
      onDecided?.(idea, status);
    }, 260);
    start(async () => {
      const r = await decideIdea(idea.id, status, reason);
      if (r.error) {
        setError(r.error);
        setQueue((q) => [idea, ...q.filter((i) => i.id !== idea.id)]);
        onDecided?.(idea, "new");
      }
    });
  }

  function undo() {
    const last = history[0];
    if (!last) return;
    haptic("select");
    setHistory((h) => h.slice(1));
    setQueue((q) => [last, ...q]);
    onDecided?.(last, "new");
    start(async () => {
      const r = await decideIdea(last.id, "new");
      if (r.error) setError(r.error);
    });
  }

  const pass = (idea: Idea) => setAskReason(idea);

  if (!card) {
    return (
      <div className="rounded-[28px] border border-dashed border-rule px-6 py-12 text-center">
        <p className="font-semibold">You&apos;re all caught up.</p>
        <p className="mt-1 text-sm text-ash">Ask for a fresh batch above, or see what you liked in Approved.</p>
        {history.length ? <button type="button" onClick={undo} className="press mt-4 h-10 rounded-full border border-rule px-4 text-sm">Undo last</button> : null}
      </div>
    );
  }

  const likeOpacity = Math.max(0, Math.min(1, dx / THRESHOLD));
  const passOpacity = Math.max(0, Math.min(1, -dx / THRESHOLD));
  const transform = flying
    ? flying === "right"
      ? "translate(140%, -20px) rotate(18deg)"
      : flying === "left"
        ? "translate(-140%, -20px) rotate(-18deg)"
        : "translate(0, -120%) scale(0.9)"
    : `translate(${dx}px, ${dy * 0.2}px) rotate(${dx / 18}deg)`;

  return (
    <div
      className="select-none outline-none"
      tabIndex={0}
      onKeyDown={(e) => {
        if (!canSwipe) return;
        if (e.key === "ArrowRight") commit(card, "liked");
        if (e.key === "ArrowLeft") pass(card);
        if (e.key === "ArrowUp") commit(card, "saved");
      }}
    >
      <div className="mb-3 flex items-center justify-between text-xs text-ash">
        <span className="tabular">{history.length + 1} of {total}</span>
        {canSwipe ? <span className="flex items-center gap-1.5"><Icon name="swipe" className="size-4" /> Swipe right to like, left to pass</span> : null}
      </div>

      {/* Sized so the card and its buttons fit on one phone screen without scrolling. */}
      <div className="relative h-[calc(100svh-33.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] min-h-[18rem] max-h-[34rem]">
        {queue.slice(1, 3).reverse().map((i, n) => (
          <div key={i.id} className="absolute inset-0 rounded-[28px] border border-rule bg-coal transition-transform duration-300" style={{ transform: `scale(${0.92 + n * 0.04}) translateY(${(1 - n) * 18}px)` }} />
        ))}
        <article
          key={card.id}
          className={`card-in absolute inset-0 flex touch-pan-y flex-col overflow-hidden rounded-[28px] border border-rule-strong bg-char p-6 shadow-[0_30px_60px_-30px_rgb(0_0_0)] ${dragging ? "" : "transition-transform duration-300 ease-out"}`}
          style={{ transform }}
          onPointerDown={(e) => {
            if (!canSwipe || flying) return;
            origin.current = { x: e.clientX, y: e.clientY };
            setDragging(true);
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!origin.current) return;
            setDx(e.clientX - origin.current.x);
            setDy(e.clientY - origin.current.y);
          }}
          onPointerUp={() => {
            if (!origin.current) return;
            origin.current = null;
            setDragging(false);
            if (dx > THRESHOLD) commit(card, "liked");
            else if (dx < -THRESHOLD) {
              setDx(0);
              setDy(0);
              pass(card);
            } else {
              setDx(0);
              setDy(0);
            }
          }}
          onPointerCancel={() => {
            origin.current = null;
            setDragging(false);
            setDx(0);
            setDy(0);
          }}
        >
          <div className="pointer-events-none absolute inset-0 rounded-[28px]" style={{ boxShadow: `inset 0 0 0 2px rgb(82 192 138 / ${likeOpacity}), inset 0 0 0 2px rgb(239 90 90 / ${passOpacity})` }} />
          <span className="pointer-events-none absolute right-6 top-6 rotate-12 rounded-xl border-[3px] border-success px-3 py-1 text-lg font-black tracking-widest text-success" style={{ opacity: likeOpacity }}>LIKE</span>
          <span className="pointer-events-none absolute left-6 top-6 -rotate-12 rounded-xl border-[3px] border-danger px-3 py-1 text-lg font-black tracking-widest text-danger" style={{ opacity: passOpacity }}>PASS</span>

          <div className="mb-5 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-bone px-2.5 py-1 font-semibold text-ink">{card.form === "short" ? "Short-form" : "Long-form"}</span>
            {card.style && card.style !== "Claude picks" ? <span className="rounded-full border border-rule px-2.5 py-1 text-mist">{card.style}</span> : card.angle ? <span className="rounded-full border border-rule px-2.5 py-1 text-mist">{card.angle}</span> : null}
          </div>
          {card.title ? <p className="mb-2 text-sm font-medium text-mist">{card.title}</p> : null}
          <p className="text-[clamp(1.25rem,5.5vw,1.65rem)] font-semibold leading-[1.15] tracking-tight">{card.hook}</p>
          {card.why ? <p className="mt-4 text-sm leading-6 text-mist">{card.why}</p> : null}
          {card.script ? (
            <div className="relative mt-4 min-h-0 flex-1 overflow-hidden">
              <p className="whitespace-pre-wrap text-sm leading-6 text-ash">{card.script}</p>
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-char to-transparent" />
            </div>
          ) : <div className="flex-1" />}
          <button type="button" onClick={() => setExpanded(true)} onPointerDown={(e) => e.stopPropagation()} className="press mt-4 flex h-11 items-center justify-center gap-2 rounded-full border border-rule text-sm">
            <Icon name="note" className="size-4" /> Read the full idea
          </button>
        </article>
      </div>

      {canSwipe ? (
        <div className="mt-4 grid grid-cols-4 items-center justify-items-center gap-2 px-2">
          <button type="button" aria-label="Undo" disabled={!history.length} onClick={undo} className="press grid size-12 place-items-center rounded-full border border-rule bg-coal text-mist disabled:opacity-30">
            <Icon name="undo" className="size-5" stroke={2} />
          </button>
          <button type="button" aria-label="Pass" data-haptic="none" onClick={() => pass(card)} className="press grid size-16 place-items-center rounded-full border border-rule-strong bg-char text-danger shadow-[0_10px_30px_-12px_rgb(239_90_90/0.6)]">
            <Icon name="x" className="size-7" stroke={2.6} />
          </button>
          <button type="button" aria-label="Like" data-haptic="none" onClick={() => commit(card, "liked")} className="press grid size-16 place-items-center rounded-full bg-bone text-ink shadow-[0_10px_30px_-10px_rgb(244_244_242/0.45)]">
            <Icon name="heart" className="size-7" filled stroke={1.4} />
          </button>
          <button type="button" aria-label="Save for recording" data-haptic="none" onClick={() => commit(card, "saved")} className="press grid size-12 place-items-center rounded-full border border-rule bg-coal text-attention">
            <Icon name="star" className="size-5" filled stroke={1.2} />
          </button>
        </div>
      ) : (
        <p className="mt-4 text-center text-sm text-ash">You can read these ideas. Ask {AGENCY_NAME} if you want to vote on them.</p>
      )}
      {error ? <p role="alert" className="mt-3 text-center text-sm text-danger">{error}</p> : null}

      <Sheet open={expanded} onClose={() => setExpanded(false)} title={card.form === "long" ? "Long-form idea" : "Short-form idea"}>
        <p className="mb-4 text-xl font-semibold leading-tight tracking-tight">{card.hook}</p>
        <IdeaDetail idea={card} />
        {canSwipe ? (
          <div className="sticky bottom-0 mt-6 grid grid-cols-3 gap-2 bg-coal pb-2 pt-3">
            <button type="button" onClick={() => { setExpanded(false); pass(card); }} className="press h-12 rounded-full border border-danger/60 text-sm text-danger">Pass</button>
            <button type="button" onClick={() => commit(card, "saved")} className="press h-12 rounded-full border border-rule-strong text-sm">★ Save</button>
            <button type="button" onClick={() => commit(card, "liked")} className="press h-12 rounded-full bg-bone text-sm font-semibold text-ink">Like</button>
          </div>
        ) : null}
      </Sheet>

      <Sheet open={Boolean(askReason)} onClose={() => setAskReason(null)} title="Why not? (optional)">
        <p className="-mt-1 mb-3 text-sm text-ash">Claude uses this to write better ideas next time.</p>
        <div className="grid grid-cols-2 gap-2">
          {PASS_REASONS.map((r) => (
            <button key={r} type="button" onClick={() => { commit(askReason!, "passed", r); setAskReason(null); }} className="press h-12 rounded-full border border-rule text-sm hover:border-bone">{r}</button>
          ))}
          <button type="button" onClick={() => { commit(askReason!, "passed"); setAskReason(null); }} className="press h-12 rounded-full bg-bone text-sm font-semibold text-ink">Just pass</button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = new FormData(e.currentTarget).get("reason");
            commit(askReason!, "passed", String(v ?? ""));
            setAskReason(null);
          }}
          className="mt-3 flex gap-2"
        >
          <input name="reason" placeholder="Something else…" className="field" />
          <button className="press h-12 shrink-0 rounded-full border border-rule-strong px-4 text-sm">Pass</button>
        </form>
      </Sheet>
    </div>
  );
}
