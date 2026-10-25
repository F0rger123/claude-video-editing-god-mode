"use client";

import type { CSSProperties } from "react";
import { CAPTION_PRESETS } from "@/lib/domain/caption-presets";

/** Live mini previews. They approximate the look (the real fonts are on the editing PC). */
const LOOK: Record<string, { word: CSSProperties; rest?: CSSProperties; anim: string }> = {
  "3d": {
    word: { color: "#fff", fontWeight: 900, fontSize: 22, letterSpacing: "-0.02em", textShadow: "1px 1px 0 #b91c1c,2px 2px 0 #b91c1c,3px 3px 0 #991b1b,4px 4px 0 #991b1b,5px 5px 0 #7f1d1d,6px 6px 0 #7f1d1d,8px 10px 12px rgb(0 0 0/.6)", transform: "perspective(200px) rotateX(12deg)" },
    anim: "cp-pop",
  },
  highlight: { word: { color: "#111", background: "#facc15", borderRadius: 6, padding: "0 4px", fontWeight: 900, fontSize: 18, textTransform: "uppercase" }, rest: { color: "#fff", fontWeight: 900, fontSize: 18, textTransform: "uppercase", WebkitTextStroke: "1px #000" }, anim: "cp-blink" },
  pop: { word: { color: "#FF8100", fontWeight: 900, fontSize: 22, textShadow: "0 3px 6px rgb(0 0 0/.6)" }, anim: "cp-throw" },
  clean: { word: { color: "#FFF6E3", fontWeight: 800, fontSize: 20, textShadow: "0 0 12px rgb(255 246 227/.7)" }, anim: "cp-drift" },
  minimal: { word: { color: "#fff", fontWeight: 500, fontSize: 13, textShadow: "0 1px 3px rgb(0 0 0/.8)" }, anim: "cp-fade" },
  neon: { word: { color: "#00C1FF", fontWeight: 900, fontSize: 21, textShadow: "0 0 6px #00C1FF,0 0 16px #00C1FF" }, anim: "cp-slide" },
  gold: { word: { color: "#FFDB00", fontWeight: 900, fontSize: 21, textShadow: "0 0 10px rgb(255 219 0/.6)" }, rest: { color: "#18AE00", fontStyle: "italic", fontFamily: "cursive", fontSize: 15 }, anim: "cp-pop" },
  glitch: { word: { color: "#FF1B1B", fontWeight: 900, fontSize: 21, textShadow: "2px 0 #00E8FF,-2px 0 #FF1B1B" }, anim: "cp-glitch" },
  stack: { word: { color: "#FF0000", fontWeight: 900, fontSize: 26, lineHeight: 0.9 }, rest: { color: "#FFEFC3", fontWeight: 900, fontSize: 26, lineHeight: 0.9 }, anim: "cp-pop" },
  elegant: { word: { color: "#fff", fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 22 }, rest: { color: "#fff", fontFamily: "cursive", fontSize: 18 }, anim: "cp-drift" },
  typewriter: { word: { color: "#fff", fontFamily: "ui-monospace, monospace", fontSize: 14, background: "rgb(0 0 0/.55)", padding: "2px 6px", borderRadius: 6 }, anim: "cp-type" },
  caps: { word: { color: "#fff", fontWeight: 800, fontSize: 22, letterSpacing: "0.06em", textTransform: "uppercase", fontStretch: "condensed", textShadow: "0 0 8px rgb(255 255 255/.5)" }, anim: "cp-slide" },
};

function Preview({ id }: { id: string }) {
  const look = LOOK[id];
  if (!look) return null;
  if (id === "stack") {
    return (
      <span className={`${look.anim} grid text-center`}>
        <span style={look.rest}>THIS</span>
        <span style={look.word}>CHANGES</span>
      </span>
    );
  }
  if (id === "highlight") {
    return (
      <span className="text-center leading-tight">
        <span style={look.rest}>THIS </span>
        <span className={look.anim} style={look.word}>CHANGES</span>
        <span style={look.rest}> ALL</span>
      </span>
    );
  }
  if (id === "gold" || id === "elegant") {
    return (
      <span className={`${look.anim} grid text-center leading-tight`}>
        <span style={look.word}>{id === "gold" ? "$10K" : "This changes"}</span>
        <span style={look.rest}>{id === "gold" ? "a month" : "everything"}</span>
      </span>
    );
  }
  return (
    <span className={`${look.anim} text-center leading-tight`} style={look.word}>
      {id === "minimal" ? "This changes everything" : id === "typewriter" ? "this changes▌" : "CHANGES"}
    </span>
  );
}

/**
 * Pick a caption style for this video. "Let Claude pick" follows the brand (or the editor's
 * taste); a style forces that exact look for this one video.
 */
export function CaptionPicker({ value, onChange, forClient }: { value: string; onChange: (id: string) => void; forClient: boolean }) {
  return (
    <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1">
      <button type="button" onClick={() => onChange("auto")} aria-pressed={value === "auto"} className={`press flex h-36 w-24 shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-2xl border-2 text-center ${value === "auto" ? "border-bone bg-char" : "border-rule"}`}>
        <span className="text-2xl">✦</span>
        <span className="px-2 text-xs font-semibold">Let Claude pick</span>
      </button>
      {CAPTION_PRESETS.map((p) => (
        <button key={p.id} type="button" onClick={() => onChange(p.id)} aria-pressed={value === p.id} title={p.blurb} className={`press relative flex h-36 w-24 shrink-0 snap-start flex-col overflow-hidden rounded-2xl border-2 ${value === p.id ? "border-bone" : "border-rule"}`}>
          <span className="grid flex-1 place-items-center bg-[radial-gradient(circle_at_50%_30%,#3a3a3a,#0b0b0b)] px-1">
            <Preview id={p.id} />
          </span>
          <span className="bg-coal px-1.5 py-1.5 text-left">
            <span className="block truncate text-[11px] font-semibold">{p.name}</span>
            {p.packFont && forClient ? <span className="block truncate text-[9px] text-attention">Personal-use font</span> : <span className="block truncate text-[9px] text-ash">{p.blurb}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}
