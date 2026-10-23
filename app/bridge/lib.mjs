// Pure helpers for the editor bridge. They mirror the folder layout and state format of
// herk-edit-kit/scripts/drive-inbox.mjs exactly; see docs/EDITOR-INTEGRATION.md.
// Nothing here touches the network or the disk, so it is unit-tested (lib.test.mjs).

import path from "node:path";

export const VIDEO_EXT = /\.(mp4|mov|m4v|mkv|webm|avi|3gp)$/i;

/** Same slug rule as drive-inbox.mjs (used for style-profile folder names). */
export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "clip";

/** Same brand layout as drive-inbox.mjs brandDirs(). */
export function brandDirs(root, brand) {
  const b = path.join(root, brand);
  return {
    root: b,
    inspo: path.join(b, "1 Inspiration"),
    short: path.join(b, "2 Upload Raw", "Short-form"),
    long: path.join(b, "2 Upload Raw", "Long-form"),
    // Not scanned by drive-inbox (it only lists files directly in Short-form / Long-form).
    jobFiles: path.join(b, "2 Upload Raw", "Job files"),
    finished: path.join(b, "3 Finished"),
    yes: path.join(b, "4 Rate", "Yes"),
    maybe: path.join(b, "4 Rate", "Maybe"),
    no: path.join(b, "4 Rate", "No"),
    again: path.join(b, "4 Rate", "Try again"),
    archive: path.join(b, "5 Archive"),
  };
}

/** Windows-safe file name part. */
export function safePart(s, max = 60) {
  return String(s).replace(/[<>:"/\\|?*\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max).trim() || "video";
}

/** The clip base name the editor will use for folders and option files. Unique per job. */
export function clipBaseFor(job) {
  return `${safePart(job.title, 50)} az-${job.id.slice(0, 8)}`;
}

/** Brand folder for a workspace. */
export function brandFor(ws) {
  return safePart(ws.editor_brand_folder || ws.name, 80);
}

const ABOUT_TEMPLATE_MARK = "Tell the editor who these videos are for.";
export const BRIDGE_MARK = "(Written by God Mode Cut from the client's brand profile. Edit it in the app.)";

/** Should the bridge (re)write About this brand.txt? Only if missing, blank template, or ours. */
export function shouldWriteAbout(existing) {
  if (existing === null || existing === undefined) return true;
  return existing.includes(ABOUT_TEMPLATE_MARK) || existing.includes(BRIDGE_MARK);
}

export function aboutText(ws) {
  const b = ws.brand_profile || {};
  const lines = [
    `${ws.name.toUpperCase()}: ABOUT THIS BRAND`,
    BRIDGE_MARK,
    "",
    `Account / handle: ${b.handle || ""}`,
    `What the videos are about: ${b.about || ""}`,
    `Voice: ${b.voice || ""}`,
    `Brand colors and fonts: ${[b.colors, b.fonts].filter(Boolean).join(" / ")}`,
    `Always do: ${b.always || ""}`,
    `Never do: ${b.never || ""}`,
    `Call to action: ${b.cta || ""}`,
  ];
  return lines.join("\r\n") + "\r\n";
}

/**
 * The note the editor reads next to the raw clip ("<clip>.txt"). It is inserted into the
 * editor's prompt as "My instructions for this clip", so it is written as instructions.
 */
export function editNote({ job, media, extraDir, agencyNotes, requestedOutputs, styles = [], script = null, materials = [], libraryIndex = null }) {
  const others = media.filter((m) => m.role !== "primary" && m.localName);
  const refs = media.filter((m) => m.kind === "link" && m.url);
  const notes = media.filter((m) => m.kind === "note" && m.body);
  const lines = [
    `Video: ${job.title}`,
    `Format: ${job.form === "long" ? "long-form 16:9" : "short-form 9:16"}${job.platforms?.length ? ` for ${job.platforms.join(", ")}` : ""}.`,
  ];
  if (job.client_notes) lines.push(`Client notes: ${job.client_notes}`);
  if (script) {
    lines.push("", "The speaker recorded this script (use it to find the best takes and keep its hook and payoff):", script.hook, ...(script.script ? [script.script] : []), "");
  }
  // Style picks: a saved preset (with its instructions and reference files) or "auto" = Claude's call.
  for (const s of styles) {
    if (s.auto) lines.push(`${s.label}: your choice, based on this brand's profile, inspiration and past approved edits.`);
    else lines.push(`${s.label}: "${s.name}"${s.instructions ? ` — ${s.instructions}` : ""}${s.refs?.length ? ` (reference files: ${s.refs.join(", ")})` : ""}`);
  }
  if (job.style_choices?.notes) lines.push(`Look for this video: ${job.style_choices.notes}`);
  if (materials.length) {
    lines.push("", "Use these from my library in this video (picked by me):");
    for (const m of materials) lines.push(`- ${m.name} (${m.kind})${m.path ? `: ${m.path}` : ""}${m.notes ? ` — ${m.notes}` : ""}`);
  }
  if (libraryIndex) lines.push("", `My full library (sound effects, overlays, LUTs, fonts) with notes on when to use each: ${libraryIndex}. Prefer it over generic kit assets.`);
  if (agencyNotes) lines.push(`Agency notes: ${agencyNotes}`);
  for (const n of notes) lines.push(`Note: ${n.body}`);
  if (others.length) {
    lines.push("", `More files for this same video are in: ${extraDir}`);
    for (const m of others) {
      const what =
        m.kind === "broll" ? "B-roll" : m.kind === "photo" ? "photo" : m.kind === "logo" ? "logo / brand asset" : m.kind === "audio" ? "audio" : m.kind.startsWith("reference") ? "reference only (do not use in the edit)" : "another take";
      lines.push(`- ${m.localName}: ${what}`);
    }
    lines.push("Use the best take(s) and the supporting footage where it helps. Do not treat the extra files as separate videos.");
  }
  if (refs.length) {
    lines.push("", "Reference videos (style to follow; try yt-dlp into tmp/ if useful):");
    for (const r of refs) lines.push(`- ${r.url}`);
  }
  if (requestedOutputs && requestedOutputs > 1) lines.push("", `Make ${requestedOutputs} clearly different options if the run allows it.`);
  lines.push(
    "",
    "If the footage is unusable, or you cannot finish this edit confidently, still render what you can and write",
    "NEEDS-REVIEW.txt in your project folder with one short reason. The team will review it before it posts.",
  );
  return lines.join("\r\n") + "\r\n";
}

/**
 * Maps the editor's state for one dropped job to a PWA status.
 * `entry` = state.jobs[key] from tmp/drive-inbox/state.json (may be undefined before the editor sees it).
 */
export function statusFromEditor({ entry, inProgress, paused, hasNewRender }) {
  if (paused) return { status: "editing", paused: true };
  if (!entry) return { status: inProgress ? "editing" : "queued" };
  if (entry.status === "running") return { status: hasNewRender ? "rendering" : "editing" };
  if (entry.status === "waiting") return { status: "editing", paused: true };
  if (entry.status === "done") return { status: "done" };
  if (entry.status === "failed") return (entry.attempts ?? 0) >= 2 ? { status: "failed" } : { status: "queued", retrying: true };
  return { status: "queued" };
}

/** Option outputs for a clip that were not imported yet, oldest letter first. */
export function newOptions(state, brand, clipBase, imported) {
  const done = new Set(imported || []);
  return Object.entries(state.outputs || {})
    .filter(([name, o]) => o && o.clip === clipBase && (!o.brand || o.brand === brand) && !done.has(name))
    .map(([name, o]) => ({ name, letter: o.option, description: o.description || "", project: o.project }))
    .sort((a, b) => String(a.letter).localeCompare(String(b.letter)));
}

/** Key drive-inbox uses for a try-again job (prefix; the suffix is the file mtime). */
export const againKeyPrefix = (file) => `again:${file}:`;

export function findAgainEntry(state, file) {
  const prefix = againKeyPrefix(file);
  const keys = Object.keys(state.jobs || {}).filter((k) => k.startsWith(prefix));
  return keys.length ? state.jobs[keys[keys.length - 1]] : undefined;
}

/**
 * Script-idea prompt. Mirrors src/lib/domain/scripts.ts (scriptPrompt) — keep the two in sync.
 */
export function scriptPrompt({ workspaceName, brand = {}, count, history = [], longShare = 0.2 }) {
  const liked = history.filter((h) => h.status !== "passed").slice(0, 25);
  const passed = history.filter((h) => h.status === "passed").slice(0, 25);
  const longCount = Math.round(count * longShare);
  return [
    `Write ${count} new video ideas for "${workspaceName}": ${count - longCount} short-form (15–60s reels/TikToks) and ${longCount} long-form (YouTube, 6–12 min).`,
    brand.about ? `About the business: ${brand.about}` : "",
    brand.voice ? `Voice: ${brand.voice}` : "",
    brand.always ? `Always: ${brand.always}` : "",
    brand.never ? `Never: ${brand.never}` : "",
    brand.cta ? `Usual call to action: ${brand.cta}` : "",
    "Use proven viral hook patterns (curiosity gap, bold claim, myth vs truth, before/after, mistake to avoid, number list, story open loop), but make each specific to this business. No clickbait the video cannot pay off.",
    liked.length ? `They liked these (do more like them, never repeat them):\n${liked.map((h) => `- ${h.hook}`).join("\n")}` : "",
    passed.length ? `They passed on these (avoid the pattern; reasons given where known):\n${passed.map((h) => `- ${h.hook}${h.reason ? ` — ${h.reason}` : ""}`).join("\n")}` : "",
    "Each script is what the person says on camera, plain spoken sentences, with a hook in the first line and a clear payoff. Short-form scripts under 120 words; long-form give an outline of beats.",
    `Reply with JSON only: {"ideas": [{"form": "short"|"long", "hook": string (max 120 chars), "script": string, "angle": string, "why": string (one line: the viral pattern and why it fits)}]}`,
  ].filter(Boolean).join("\n\n");
}

export function parseIdeas(text) {
  const m = String(text || "").match(/\{[\s\S]*\}/);
  if (!m) return [];
  try {
    return (JSON.parse(m[0]).ideas || [])
      .filter((i) => i && typeof i.hook === "string" && i.hook.trim())
      .map((i) => ({ hook: i.hook.trim().slice(0, 400), script: typeof i.script === "string" ? i.script.slice(0, 8000) : "", angle: typeof i.angle === "string" ? i.angle.slice(0, 80) : null, why: typeof i.why === "string" ? i.why.slice(0, 300) : null, form: i.form === "long" ? "long" : "short" }));
  } catch {
    return [];
  }
}

const KIND_FOLDER = { sfx: "Sound effects", music: "Music", overlay: "Overlays", lut: "LUTs", font: "Fonts", caption: "Captions", reference: "References", other: "Other" };

/** Where a library item lives in the editor folder. Sound effects join the shared SFX pack folder. */
export function libraryTarget(root, item, brand) {
  const base = item.kind === "sfx" ? path.join(root, "Sound effects") : path.join(root, "Library", KIND_FOLDER[item.kind] || "Other");
  return brand ? path.join(base, safePart(brand, 80)) : base;
}

/** Direct file links are downloaded; anything else (a web page) is handed to Claude as a link. */
export const DIRECT_FILE = /\.(wav|mp3|m4a|aac|aiff?|ogg|flac|mp4|mov|webm|cube|3dl|ttf|otf|woff2?|png|jpe?g|gif|zip)(\?.*)?$/i;

export function libraryIndexText(items) {
  const lines = ["# My editing library", "", "Written by the God Mode Cut app. Use these first; notes say when.", ""];
  const groups = {};
  for (const i of items) (groups[i.kind] ||= []).push(i);
  for (const [kind, list] of Object.entries(groups)) {
    lines.push(`## ${KIND_FOLDER[kind] || kind}`);
    for (const i of list) lines.push(`- ${i.name}${i.brand ? ` (only ${i.brand})` : ""}: ${i.synced_path || i.url || i.local_path}${i.notes ? ` — ${i.notes}` : ""}`);
    lines.push("");
  }
  return lines.join("\r\n");
}

/** Mirrors src/lib/domain/scripts.ts ideaRequestPrompt — a test asserts both produce the same text. */
export function ideaRequestPrompt({ workspaceName, brand = {}, form, style, topic = null, count, history = [] }) {
  const b = brand;
  const liked = history.filter((h) => h.status !== "passed").slice(0, 20);
  const passed = history.filter((h) => h.status === "passed").slice(0, 20);
  const long = form === "long";
  return [
    `Write ${count} complete ${long ? "long-form YouTube video (6–12 min)" : "short-form reel/TikTok/Short (15–60 s)"} ideas for "${workspaceName}".`,
    `Style: ${style === "Claude picks" ? "pick the best style per idea" : style}.`,
    topic ? `Topic or angle requested: ${topic}` : "",
    b.about ? `About the business: ${b.about}` : "",
    b.voice ? `Voice: ${b.voice}` : "",
    b.always ? `Always: ${b.always}` : "",
    b.never ? `Never: ${b.never}` : "",
    b.cta ? `Usual call to action: ${b.cta}` : "",
    liked.length ? `They liked these before (similar quality, never repeat):\n${liked.map((h) => `- ${h.hook}`).join("\n")}` : "",
    passed.length ? `They passed on these (avoid; reasons where known):\n${passed.map((h) => `- ${h.hook}${h.reason ? ` — ${h.reason}` : ""}`).join("\n")}` : "",
    "Hooks must stop the scroll in the first second and be paid off by the video. Specific to this business, plain spoken, no hype words.",
    long
      ? "For each: a YouTube title (max 70 chars), a hook (first line spoken), the spoken intro (first 30–45 s, word for word), an outline of 5–8 sections with what to say and show in each, a B-roll / screen-recording shot list, 2–4 word thumbnail text, a description-style caption with CTA."
      : "For each: the hook (first line spoken), the full spoken script word for word (under 120 words), a shot list (what to film or show for each line), and a caption with CTA.",
    `Reply with JSON Lines only: one complete idea per line, as soon as each is ready, no array and no other text. Each line: {"title": string|null, "hook": string, "script": string, "outline": string|null, "broll": string, "thumbnail_text": string|null, "caption": string, "angle": string, "why": string}`,
  ].filter(Boolean).join("\n\n");
}

/** Mirrors parseFullIdeas in the app: JSON Lines (one idea per line) or {"ideas": [...]}. */
export function parseFullIdeas(text, form, style) {
  const str = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  const raw = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const t = line.trim().replace(/,$/, "");
    if (!t.startsWith("{")) continue;
    try {
      const obj = JSON.parse(t);
      if (Array.isArray(obj.ideas)) raw.push(...obj.ideas);
      else raw.push(obj);
    } catch {
      // incomplete line
    }
  }
  if (!raw.length) {
    const m = String(text || "").match(/\{[\s\S]*\}/);
    try {
      if (m) raw.push(...(JSON.parse(m[0]).ideas || []));
    } catch {
      return [];
    }
  }
  try {
    return raw
      .filter((i) => i && typeof i.hook === "string" && i.hook.trim())
      .map((i) => ({ form, style, hook: i.hook.trim().slice(0, 400), script: str(i.script, 8000) ?? "", title: str(i.title, 120), outline: str(i.outline, 8000), broll: str(i.broll, 4000), thumbnail_text: str(i.thumbnail_text, 60), caption: str(i.caption, 2200), angle: str(i.angle, 80), why: str(i.why, 300) }));
  } catch {
    return [];
  }
}

/** Extract caption JSON from Claude output. */
export function parseCaptionJson(text) {
  const m = String(text || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const raw = JSON.parse(m[0]);
    const out = {};
    for (const [platform, c] of Object.entries(raw)) {
      if (!c || typeof c.caption !== "string") continue;
      out[platform] = {
        caption: c.caption,
        hashtags: (Array.isArray(c.hashtags) ? c.hashtags : []).map((h) => `#${String(h).replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "")}`).filter((h) => h.length > 1),
        cta: typeof c.cta === "string" ? c.cta : null,
        title: typeof c.title === "string" ? c.title : null,
        description: typeof c.description === "string" ? c.description : null,
      };
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}
