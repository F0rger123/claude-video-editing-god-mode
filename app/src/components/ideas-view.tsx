"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { decideIdea } from "@/app/actions/scripts";
import { Icon } from "@/components/icons";
import { IdeaDeck, type Idea } from "@/components/idea-deck";
import { IdeaDetail } from "@/components/idea-detail";
import { IdeaLibrary } from "@/components/idea-library";
import { haptic } from "@/lib/haptics";

type Decided = Idea & { status: string; job_id?: string | null; reason?: string | null };
type Tab = "new" | "approved" | "passed";
type Mode = "swipe" | "list";

const MODE_KEY = "azc-idea-mode";

/**
 * The ideas section, shared by the owner and clients:
 *   New      — swipe through them, or scroll a list and decide with buttons
 *   Approved — everything liked or saved (ready to record), plus recorded ones
 *   Passed   — what was turned down, with "Bring back"
 * Decisions move ideas between tabs immediately; the server copy catches up on the next refresh.
 */
export function IdeasView({
  fresh,
  approved,
  passed,
  canSwipe,
  workspaceId,
  uploadHref,
  jobHref,
  canAdd,
  makeHref,
}: {
  fresh: Idea[];
  approved: Decided[];
  passed: Decided[];
  canSwipe: boolean;
  workspaceId: string;
  uploadHref: string;
  jobHref: string;
  canAdd: boolean;
  makeHref?: string;
}) {
  const [tab, setTab] = useState<Tab>("new");
  const [mode, setMode] = useState<Mode>("swipe");
  // Local decisions made this visit: id → status ("new" = put back).
  const [local, setLocal] = useState<Map<string, { idea: Idea; status: string }>>(new Map());

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(MODE_KEY);
    } catch {
      // storage blocked
    }
    if (saved === "list") {
      const id = requestAnimationFrame(() => setMode("list"));
      return () => cancelAnimationFrame(id);
    }
  }, []);

  const decided = (idea: Idea, status: string) =>
    setLocal((m) => {
      const next = new Map(m);
      next.set(idea.id, { idea, status });
      return next;
    });

  const lists = useMemo(() => {
    const statusOf = (id: string, server: string) => local.get(id)?.status ?? server;
    const all = new Map<string, Decided>();
    for (const i of fresh) all.set(i.id, { ...i, status: "new" });
    for (const i of [...approved, ...passed]) all.set(i.id, i);
    for (const [id, { idea }] of local) if (!all.has(id)) all.set(id, { ...idea, status: "new" });
    const items = [...all.values()].map((i) => ({ ...i, status: statusOf(i.id, i.status) }));
    return {
      fresh: items.filter((i) => i.status === "new"),
      approved: items.filter((i) => ["liked", "saved", "recorded"].includes(i.status)),
      passed: items.filter((i) => i.status === "passed"),
    };
  }, [fresh, approved, passed, local]);

  const setModeSaved = (m: Mode) => {
    setMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      // storage blocked
    }
  };

  const tabs: { key: Tab; label: string; n: number }[] = [
    { key: "new", label: "New", n: lists.fresh.length },
    { key: "approved", label: "Approved", n: lists.approved.filter((i) => i.status !== "recorded").length },
    { key: "passed", label: "Passed", n: lists.passed.length },
  ];

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <div role="tablist" aria-label="Ideas" className="grid flex-1 grid-cols-3 rounded-full border border-rule p-0.5 text-sm">
          {tabs.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className={`press flex h-9 items-center justify-center gap-1.5 rounded-full ${tab === t.key ? "bg-bone font-semibold text-ink" : "text-mist"}`}>
              {t.label}
              <span className={`tabular text-xs ${tab === t.key ? "text-ink/60" : "text-ash"}`}>{t.n}</span>
            </button>
          ))}
        </div>
        {tab === "new" ? (
          <button
            type="button"
            onClick={() => setModeSaved(mode === "swipe" ? "list" : "swipe")}
            aria-label={mode === "swipe" ? "Show as a list" : "Show as cards to swipe"}
            className="press grid size-10 shrink-0 place-items-center rounded-full border border-rule text-mist"
          >
            <Icon name={mode === "swipe" ? "list" : "swipe"} className="size-5" />
          </button>
        ) : null}
      </div>

      {tab === "new" ? (
        mode === "swipe" ? (
          <IdeaDeck key="deck" ideas={lists.fresh} canSwipe={canSwipe} onDecided={decided} />
        ) : (
          <IdeaList ideas={lists.fresh} canSwipe={canSwipe} onDecided={decided} />
        )
      ) : tab === "approved" ? (
        <IdeaLibrary workspaceId={workspaceId} ideas={lists.approved as never} uploadHref={uploadHref} jobHref={jobHref} canAdd={canAdd} makeHref={makeHref} />
      ) : (
        <PassedList ideas={lists.passed} canSwipe={canSwipe} onDecided={decided} />
      )}
    </div>
  );
}

/** Scrollable list of new ideas, each with Pass / Save / Like. */
function IdeaList({ ideas, canSwipe, onDecided }: { ideas: Idea[]; canSwipe: boolean; onDecided: (idea: Idea, status: string) => void }) {
  const [leaving, setLeaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  function decide(idea: Idea, status: "liked" | "passed" | "saved") {
    haptic(status === "passed" ? "warning" : "success");
    setLeaving(idea.id);
    setTimeout(() => {
      onDecided(idea, status);
      setLeaving(null);
    }, 220);
    start(async () => {
      const r = await decideIdea(idea.id, status);
      if (r.error) {
        setError(r.error);
        onDecided(idea, "new");
      }
    });
  }

  if (!ideas.length) {
    return (
      <div className="rounded-[28px] border border-dashed border-rule px-6 py-12 text-center">
        <p className="font-semibold">No new ideas.</p>
        <p className="mt-1 text-sm text-ash">Ask for a fresh batch above.</p>
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      {ideas.map((i, n) => (
        <article
          key={i.id}
          className={`rise-in rounded-3xl border border-rule bg-char p-5 transition-all duration-200 ${leaving === i.id ? "-translate-x-4 scale-[0.98] opacity-0" : ""}`}
          style={{ animationDelay: `${Math.min(n, 6) * 40}ms` }}
        >
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-bone px-2.5 py-1 font-semibold text-ink">{i.form === "short" ? "Short-form" : "Long-form"}</span>
            {i.style && i.style !== "Claude picks" ? <span className="rounded-full border border-rule px-2.5 py-1 text-mist">{i.style}</span> : i.angle ? <span className="rounded-full border border-rule px-2.5 py-1 text-mist">{i.angle}</span> : null}
          </div>
          {i.title ? <p className="mb-1 text-sm font-medium text-mist">{i.title}</p> : null}
          <p className="text-lg font-semibold leading-snug tracking-tight">{i.hook}</p>
          {i.why ? <p className="mt-2 text-sm leading-6 text-mist">{i.why}</p> : null}
          <details className="mt-3">
            <summary className="press inline-flex h-9 cursor-pointer list-none items-center gap-1.5 text-sm text-mist">
              <Icon name="note" className="size-4" /> Read the full idea
            </summary>
            <div className="mt-3">
              <IdeaDetail idea={i} />
            </div>
          </details>
          {canSwipe ? (
            <div className="mt-4 grid grid-cols-3 gap-2">
              <button type="button" data-haptic="none" onClick={() => decide(i, "passed")} aria-label={`Pass: ${i.hook}`} className="press flex h-11 items-center justify-center gap-1.5 rounded-full border border-rule text-sm text-danger">
                <Icon name="x" className="size-4" stroke={2.4} /> Pass
              </button>
              <button type="button" data-haptic="none" onClick={() => decide(i, "saved")} aria-label={`Save: ${i.hook}`} className="press flex h-11 items-center justify-center gap-1.5 rounded-full border border-rule text-sm text-attention">
                <Icon name="star" className="size-4" filled stroke={1.2} /> Save
              </button>
              <button type="button" data-haptic="none" onClick={() => decide(i, "liked")} aria-label={`Like: ${i.hook}`} className="press flex h-11 items-center justify-center gap-1.5 rounded-full bg-bone text-sm font-semibold text-ink">
                <Icon name="heart" className="size-4" filled stroke={1.2} /> Like
              </button>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

/** Ideas that were passed, with the reason, and a way to put one back in the deck. */
function PassedList({ ideas, canSwipe, onDecided }: { ideas: Decided[]; canSwipe: boolean; onDecided: (idea: Idea, status: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  if (!ideas.length) {
    return <p className="rounded-2xl border border-dashed border-rule px-5 py-8 text-center text-sm text-ash">Nothing passed yet.</p>;
  }
  return (
    <div className="grid gap-2">
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      {ideas.map((i) => (
        <div key={i.id} className="flex items-start gap-3 rounded-2xl border border-rule px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-mist">{i.hook}</p>
            {i.reason ? <p className="mt-1 text-xs text-ash">Why: {i.reason}</p> : null}
          </div>
          {canSwipe ? (
            <button
              type="button"
              onClick={() => {
                onDecided(i, "new");
                start(async () => {
                  const r = await decideIdea(i.id, "new");
                  if (r.error) {
                    setError(r.error);
                    onDecided(i, "passed");
                  }
                });
              }}
              className="press h-9 shrink-0 rounded-full border border-rule px-3 text-xs"
            >
              Bring back
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
