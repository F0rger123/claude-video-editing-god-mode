/**
 * Turns review feedback into structured instructions for the existing editor.
 *
 * The editor's own "Try again" flow reads a plain-text note next to the option it
 * should redo (see docs/EDITOR-INTEGRATION.md). We keep the structure in the database
 * (`content_revisions.instructions`) and render it to that note format, so the editor
 * receives the same kind of note the owner used to type by hand — just more precise.
 */

export type FeedbackItem = {
  body: string;
  at_seconds: number | null;
  reference_url: string | null;
  author_label: string | null;
  internal: boolean;
  media_file?: string | null;
};

export type RevisionInstructions = {
  round: number;
  fromVersion: number;
  summary: string;
  timestamped: { at: string; seconds: number; change: string }[];
  general: string[];
  references: string[];
  newMedia: string[];
  keep: string[];
};

export function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "keep …" / "love …" / "don't change …" lines are preserved as constraints rather than changes. */
const KEEP_RE = /^(keep|love|don'?t change|do not change|leave)\b/i;

export function buildInstructions(
  items: FeedbackItem[],
  opts: { round: number; fromVersion: number; extraNote?: string | null; newMedia?: string[] },
): RevisionInstructions {
  const timestamped: RevisionInstructions["timestamped"] = [];
  const general: string[] = [];
  const keep: string[] = [];
  const references = new Set<string>();

  for (const item of items) {
    const text = item.body.trim().replace(/\s+/g, " ");
    if (item.reference_url) references.add(item.reference_url);
    for (const url of text.match(/https?:\/\/\S+/g) ?? []) references.add(url.replace(/[).,]+$/, ""));
    if (!text) continue;
    if (KEEP_RE.test(text)) keep.push(text);
    else if (item.at_seconds !== null && item.at_seconds !== undefined) {
      timestamped.push({ at: formatTimestamp(item.at_seconds), seconds: item.at_seconds, change: text });
    } else general.push(text);
  }
  if (opts.extraNote?.trim()) general.unshift(opts.extraNote.trim());
  timestamped.sort((a, b) => a.seconds - b.seconds);

  const count = timestamped.length + general.length;
  const summary = count
    ? `${count} change${count === 1 ? "" : "s"} requested on V${opts.fromVersion}${timestamped.length ? ` (${timestamped.length} at specific moments)` : ""}.`
    : `Try a clearly different direction from V${opts.fromVersion}.`;

  return {
    round: opts.round,
    fromVersion: opts.fromVersion,
    summary,
    timestamped,
    general,
    references: [...references],
    newMedia: opts.newMedia ?? [],
    keep,
  };
}

/** Renders instructions as the plain-text note the editor reads ("<option>.txt"). */
export function instructionsToNote(i: RevisionInstructions): string {
  const lines = [`Revision round ${i.round} (from V${i.fromVersion}). ${i.summary}`];
  if (i.timestamped.length) {
    lines.push("", "Change at these moments of the current version:");
    for (const t of i.timestamped) lines.push(`- At ${t.at}: ${t.change}`);
  }
  if (i.general.length) {
    lines.push("", "General changes:");
    for (const g of i.general) lines.push(`- ${g}`);
  }
  if (i.keep.length) {
    lines.push("", "Keep as it is:");
    for (const k of i.keep) lines.push(`- ${k}`);
  }
  if (i.references.length) {
    lines.push("", "References to follow:");
    for (const r of i.references) lines.push(`- ${r}`);
  }
  if (i.newMedia.length) {
    lines.push("", "New footage / assets supplied for this revision (use them):");
    for (const m of i.newMedia) lines.push(`- ${m}`);
  }
  lines.push("", "Only change what is asked. Keep everything else from the current version.");
  return lines.join("\r\n");
}
