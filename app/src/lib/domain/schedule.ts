import type { Platform, PostTiming, ScheduleRules, TimeWindow } from "./types";

/**
 * Posting-slot picker. Pure: given the workspace rules, the posts already planned and "now",
 * returns the earliest slot that satisfies every rule. Nothing is hard-coded (no "12 PM").
 *
 * Times in rules are wall-clock times in the workspace timezone; results are UTC instants.
 */

export type ExistingPost = { at: Date; platform: string };

export type SlotRequest = {
  rules: ScheduleRules;
  timezone: string;
  platform: Platform;
  existing: ExistingPost[];
  now: Date;
  /** Never earlier than this (for example the job's due date or "not before"). */
  notBefore?: Date;
  /** Minutes between candidate times inside a window. */
  stepMinutes?: number;
  searchDays?: number;
};

const DEFAULT_WINDOWS: TimeWindow[] = [
  { start: "09:00", end: "11:00" },
  { start: "17:00", end: "19:00" },
];

/** Offset (minutes) of `timeZone` from UTC at instant `date`. */
export function tzOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** Wall-clock date + "HH:MM" in `timeZone` → UTC Date (DST-safe via a second pass). */
export function zonedTimeToUtc(dateISO: string, hhmm: string, timeZone: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const [y, mo, d] = dateISO.split("-").map(Number);
  const guess = new Date(Date.UTC(y, mo - 1, d, h, m));
  const first = new Date(guess.getTime() - tzOffsetMinutes(guess, timeZone) * 60000);
  return new Date(guess.getTime() - tzOffsetMinutes(first, timeZone) * 60000);
}

/** The workspace-local calendar date (YYYY-MM-DD) of an instant. */
export function localDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function addDays(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing a local date (weeks run Monday–Sunday). */
function weekOf(dateISO: string): string {
  const d = new Date(`${dateISO}T12:00:00Z`);
  return addDays(dateISO, -((d.getUTCDay() + 6) % 7));
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function hhmmOf(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Workspace rules merged with the platform's overrides. */
export function effectiveRules(rules: ScheduleRules, platform: Platform): Omit<ScheduleRules, "platform_rules"> {
  const { platform_rules, ...base } = rules;
  return { ...base, ...(platform_rules?.[platform] ?? {}) };
}

export function pickSlot(req: SlotRequest): Date | null {
  const rules = effectiveRules(req.rules, req.platform);
  const windows = rules.windows?.length ? rules.windows : DEFAULT_WINDOWS;
  const step = req.stepMinutes ?? 15;
  const gapMs = (rules.min_gap_minutes ?? 120) * 60000;
  const maxPerDay = rules.max_posts_per_day ?? 2;
  const blackout = new Set(rules.blackout_dates ?? []);
  const days = rules.preferred_days?.length ? new Set(rules.preferred_days) : null;
  // Never schedule in the next 20 minutes: Buffer and the video upload need a moment.
  const earliest = Math.max(req.now.getTime() + 20 * 60000, req.notBefore?.getTime() ?? 0);
  const startDay = localDate(new Date(earliest), req.timezone);

  // Same-platform posts block the gap and the daily cap; other platforms only block the gap at the exact same time.
  const samePlatform = req.existing.filter((p) => p.platform === req.platform);

  for (let i = 0; i < (req.searchDays ?? 60); i++) {
    const day = addDays(startDay, i);
    if (blackout.has(day)) continue;
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    if (days && !days.has(weekday)) continue;
    const onDay = samePlatform.filter((p) => localDate(p.at, req.timezone) === day).length;
    if (onDay >= maxPerDay) continue;
    if (typeof rules.max_posts_per_week === "number") {
      const week = weekOf(day);
      if (samePlatform.filter((p) => weekOf(localDate(p.at, req.timezone)) === week).length >= rules.max_posts_per_week) continue;
    }

    for (const w of [...windows].sort((a, b) => minutesOf(a.start) - minutesOf(b.start))) {
      for (let t = minutesOf(w.start); t <= minutesOf(w.end); t += step) {
        const at = zonedTimeToUtc(day, hhmmOf(t), req.timezone);
        if (at.getTime() < earliest) continue;
        const clash = samePlatform.some((p) => Math.abs(p.at.getTime() - at.getTime()) < gapMs)
          || req.existing.some((p) => Math.abs(p.at.getTime() - at.getTime()) < 5 * 60000);
        if (!clash) return at;
      }
    }
  }
  return null;
}

/**
 * When an approved video should post, given its timing choice:
 *   after_edit → as soon as possible (Buffer needs a few minutes), ignoring windows
 *   fixed      → the job's exact time, or the workspace's daily time (e.g. "12:00") on the next allowed day
 *   auto_slot  → the best free slot from the schedule rules
 */
export function resolvePostTime(req: SlotRequest & { timing: PostTiming; fixedAt?: Date | null; dailyTime?: string | null }): Date | null {
  if (req.timing === "after_edit") return new Date(req.now.getTime() + 20 * 60000);
  if (req.timing === "fixed") {
    if (req.fixedAt && req.fixedAt.getTime() > req.now.getTime() + 10 * 60000) return req.fixedAt;
    if (req.dailyTime) {
      return pickSlot({ ...req, rules: { ...req.rules, windows: [{ start: req.dailyTime, end: req.dailyTime }], platform_rules: undefined } });
    }
  }
  return pickSlot(req);
}

/** Why a manually chosen time breaks the rules (warnings only: the owner can always override). */
export function slotWarnings(req: Omit<SlotRequest, "now" | "notBefore" | "stepMinutes" | "searchDays">, at: Date): string[] {
  const rules = effectiveRules(req.rules, req.platform);
  const out: string[] = [];
  const day = localDate(at, req.timezone);
  if (rules.blackout_dates?.includes(day)) out.push("This is a blackout date.");
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  if (rules.preferred_days?.length && !rules.preferred_days.includes(weekday)) out.push("Not a preferred posting day.");
  const same = req.existing.filter((p) => p.platform === req.platform);
  const gap = (rules.min_gap_minutes ?? 120) * 60000;
  if (same.some((p) => Math.abs(p.at.getTime() - at.getTime()) < gap)) out.push("Too close to another post on this platform.");
  if (same.filter((p) => localDate(p.at, req.timezone) === day).length >= (rules.max_posts_per_day ?? 2)) out.push("Daily post limit reached.");
  return out;
}
