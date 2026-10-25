"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { haptic } from "@/lib/haptics";
import { addOpenverseItem, searchOpenverse, type OpenverseHit } from "./openverse-actions";

/** Search free CC0 sounds / images on Openverse, preview, add to the library in one tap. */
export function OpenverseSearch({ defaultKind }: { defaultKind: string }) {
  const router = useRouter();
  const [type, setType] = useState<"audio" | "image">(defaultKind === "overlay" || defaultKind === "reference" ? "image" : "audio");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<OpenverseHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const kind = type === "image" ? (defaultKind === "reference" ? "reference" : "overlay") : defaultKind === "music" ? "music" : "sfx";

  const search = (e?: FormEvent) => {
    e?.preventDefault();
    setError(null);
    start(async () => {
      const r = await searchOpenverse(q, type);
      if (r.error) setError(r.error);
      setHits(r.results ?? []);
    });
  };

  return (
    <div className="rounded-3xl border border-rule p-4">
      <p className="font-semibold">Find free {type === "audio" ? "sounds" : "images"}</p>
      <p className="mb-3 text-xs text-ash">From Openverse. Only CC0 / public domain: free for client work, no credit needed.</p>
      <form onSubmit={search} className="flex gap-2">
        <div className="grid shrink-0 grid-cols-2 rounded-full border border-rule p-0.5 text-xs">
          {(["audio", "image"] as const).map((t) => (
            <button key={t} type="button" onClick={() => { setType(t); setHits(null); }} className={`press h-10 rounded-full px-3 ${type === t ? "bg-bone font-semibold text-ink" : "text-mist"}`}>
              {t === "audio" ? "Sounds" : "Images"}
            </button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={type === "audio" ? "whoosh, shutter, crowd cheer…" : "film burn, paper texture…"} className="field h-11 min-w-0 flex-1" enterKeyHint="search" />
        <button disabled={pending} aria-label="Search" className="press grid size-11 shrink-0 place-items-center rounded-full bg-bone text-ink disabled:opacity-60">
          <Icon name="search" className={`size-4 ${pending ? "animate-pulse" : ""}`} />
        </button>
      </form>
      {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
      {hits && !hits.length && !error ? <p className="mt-3 text-sm text-ash">Nothing free found for that. Try simpler words.</p> : null}
      {hits?.length ? (
        <ul className="mt-3 grid gap-2">
          {hits.map((h) => (
            <li key={h.id} className="rise-in flex items-center gap-3 rounded-2xl border border-rule bg-char p-2.5">
              {type === "image" && h.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={h.preview} alt="" className="size-14 shrink-0 rounded-xl object-cover" loading="lazy" />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{h.title}</p>
                <p className="truncate text-xs text-ash">
                  {h.source}
                  {h.duration ? ` · ${h.duration}s` : ""} · {h.license}
                </p>
                {type === "audio" ? <audio src={h.url} controls preload="none" className="mt-1.5 h-8 w-full" /> : null}
              </div>
              <button
                type="button"
                disabled={added.has(h.id)}
                onClick={() =>
                  start(async () => {
                    const r = await addOpenverseItem(h, kind);
                    if (r.error) {
                      haptic("error");
                      setError(r.error);
                    } else {
                      haptic("success");
                      setAdded((s) => new Set(s).add(h.id));
                      router.refresh();
                    }
                  })
                }
                className={`press h-10 shrink-0 rounded-full px-3.5 text-sm ${added.has(h.id) ? "text-success" : "bg-bone font-semibold text-ink"}`}
              >
                {added.has(h.id) ? "Added" : "Add"}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
