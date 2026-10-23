import type { BrandProfile } from "./types";

/**
 * Script ideas: Claude writes hooks + short scripts per client; people swipe right (like) or left
 * (pass, optional reason). Every batch is written with the latest decisions in the prompt, so the
 * ideas drift toward what this brand actually approves. Same prompt on the server and the bridge.
 */
export type IdeaDecision = { hook: string; status: "liked" | "passed" | "saved" | "recorded"; reason?: string | null; form: "short" | "long" };
export type NewIdea = { hook: string; script: string; angle: string | null; why: string | null; form: "short" | "long" };

export function scriptPrompt(input: { workspaceName: string; brand: BrandProfile; count: number; history: IdeaDecision[]; longShare?: number }): string {
  const b = input.brand;
  const liked = input.history.filter((h) => h.status !== "passed").slice(0, 25);
  const passed = input.history.filter((h) => h.status === "passed").slice(0, 25);
  const longCount = Math.round(input.count * (input.longShare ?? 0.2));
  return [
    `Write ${input.count} new video ideas for "${input.workspaceName}": ${input.count - longCount} short-form (15–60s reels/TikToks) and ${longCount} long-form (YouTube, 6–12 min).`,
    b.about ? `About the business: ${b.about}` : "",
    b.voice ? `Voice: ${b.voice}` : "",
    b.always ? `Always: ${b.always}` : "",
    b.never ? `Never: ${b.never}` : "",
    b.cta ? `Usual call to action: ${b.cta}` : "",
    "Use proven viral hook patterns (curiosity gap, bold claim, myth vs truth, before/after, mistake to avoid, number list, story open loop), but make each specific to this business. No clickbait the video cannot pay off.",
    liked.length ? `They liked these (do more like them, never repeat them):\n${liked.map((h) => `- ${h.hook}`).join("\n")}` : "",
    passed.length ? `They passed on these (avoid the pattern; reasons given where known):\n${passed.map((h) => `- ${h.hook}${h.reason ? ` — ${h.reason}` : ""}`).join("\n")}` : "",
    "Each script is what the person says on camera, plain spoken sentences, with a hook in the first line and a clear payoff. Short-form scripts under 120 words; long-form give an outline of beats.",
    `Reply with JSON only: {"ideas": [{"form": "short"|"long", "hook": string (max 120 chars), "script": string, "angle": string, "why": string (one line: the viral pattern and why it fits)}]}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function parseIdeas(text: string): NewIdea[] {
  const match = String(text || "").match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const raw = JSON.parse(match[0]) as { ideas?: unknown[] };
    return (raw.ideas ?? [])
      .map((i) => i as Record<string, unknown>)
      .filter((i) => typeof i.hook === "string" && i.hook.trim())
      .map((i) => ({
        hook: String(i.hook).trim().slice(0, 400),
        script: typeof i.script === "string" ? i.script.trim().slice(0, 8000) : "",
        angle: typeof i.angle === "string" ? i.angle.slice(0, 80) : null,
        why: typeof i.why === "string" ? i.why.slice(0, 300) : null,
        form: i.form === "long" ? "long" : "short",
      }));
  } catch {
    return [];
  }
}

/** Styles offered on the "Content ideas" buttons. */
export const IDEA_STYLES = [
  "Claude picks",
  "Educational / how-to",
  "Story",
  "Case study / results",
  "Myth vs truth",
  "List (3 tips, 5 mistakes…)",
  "Before / after",
  "Behind the scenes",
  "Hot take",
  "Tutorial / walkthrough",
  "Q&A / FAQ",
  "Day in the life",
] as const;

export type FullIdea = NewIdea & { title: string | null; outline: string | null; broll: string | null; thumbnail_text: string | null; caption: string | null; style: string };

/** Prompt for one "Content ideas" request: complete, ready-to-film ideas in one style. */
export function ideaRequestPrompt(input: { workspaceName: string; brand: BrandProfile; form: "short" | "long"; style: string; topic?: string | null; count: number; history: IdeaDecision[] }): string {
  const b = input.brand;
  const liked = input.history.filter((h) => h.status !== "passed").slice(0, 20);
  const passed = input.history.filter((h) => h.status === "passed").slice(0, 20);
  const long = input.form === "long";
  return [
    `Write ${input.count} complete ${long ? "long-form YouTube video (6–12 min)" : "short-form reel/TikTok/Short (15–60 s)"} ideas for "${input.workspaceName}".`,
    `Style: ${input.style === "Claude picks" ? "pick the best style per idea" : input.style}.`,
    input.topic ? `Topic or angle requested: ${input.topic}` : "",
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
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** One idea per line (JSON Lines, what the prompt asks for) or a {"ideas": [...]} object. */
export function parseFullIdeas(text: string, form: "short" | "long", style: string): FullIdea[] {
  const raw: unknown[] = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    const t = line.trim().replace(/,$/, "");
    if (!t.startsWith("{")) continue;
    try {
      const obj = JSON.parse(t) as Record<string, unknown>;
      if (Array.isArray(obj.ideas)) raw.push(...obj.ideas);
      else raw.push(obj);
    } catch {
      // partial or pretty-printed JSON: handled below
    }
  }
  if (!raw.length) {
    const match = String(text || "").match(/\{[\s\S]*\}/);
    try {
      if (match) raw.push(...((JSON.parse(match[0]) as { ideas?: unknown[] }).ideas ?? []));
    } catch {
      return [];
    }
  }
  {
    const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
    return raw
      .map((i) => i as Record<string, unknown>)
      .filter((i) => typeof i.hook === "string" && i.hook.trim())
      .map((i) => ({
        form,
        style,
        hook: String(i.hook).trim().slice(0, 400),
        script: str(i.script, 8000) ?? "",
        title: str(i.title, 120),
        outline: str(i.outline, 8000),
        broll: str(i.broll, 4000),
        thumbnail_text: str(i.thumbnail_text, 60),
        caption: str(i.caption, 2200),
        angle: str(i.angle, 80),
        why: str(i.why, 300),
      }));
  }
}

/** Client limit check (mirrors content_client_request_ideas). */
export function ideaQuotaLeft(used: number, limit: number): number {
  return Math.max(0, limit - used);
}

/** Generate more once the unseen pile is this small. */
export const REFILL_BELOW = 3;
