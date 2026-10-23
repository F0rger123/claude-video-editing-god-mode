import type { JobForm, OverageBehavior, PackageLimits, Platform } from "./types";

/**
 * Quota accounting. Four separate counters, never conflated:
 *   raw files      — everything uploaded (informational, never limited)
 *   edit jobs      — jobs handed to the editor (counted when first queued)
 *   deliverables   — jobs approved (counted once, at first approval)
 *   published      — posts that actually went live
 * Package limits apply to edit jobs, because that is where editing effort and
 * Claude usage are spent. 20 raw clips grouped into 3 jobs = 3, not 20.
 */
export type UsageCounts = {
  rawFiles: number;
  shortJobsThisMonth: number;
  longJobsThisMonth: number;
  jobsThisWeek: number;
  activeJobs: number;
  deliverablesThisMonth: number;
  publishedThisMonth: number;
};

export type QuotaRequest = {
  form: JobForm;
  durationMinutes?: number | null;
  platforms?: Platform[];
  /** Revision rounds already used on this job, when asking for another. */
  revisionRound?: number;
};

export type QuotaIssue = {
  code: "monthly_short" | "monthly_long" | "weekly" | "simultaneous" | "duration" | "platform" | "revisions";
  message: string;
};

export type QuotaDecision =
  | { outcome: "ok"; issues: [] }
  | { outcome: "warn" | "needs_owner" | "billable" | "blocked"; issues: QuotaIssue[] };

export function quotaIssues(limits: PackageLimits, usage: UsageCounts, request: QuotaRequest): QuotaIssue[] {
  const issues: QuotaIssue[] = [];
  const over = (limit: number | undefined, used: number) => typeof limit === "number" && used >= limit;

  if (request.revisionRound !== undefined) {
    if (typeof limits.revision_rounds === "number" && request.revisionRound >= limits.revision_rounds) {
      issues.push({ code: "revisions", message: `Revision allowance used (${limits.revision_rounds} round${limits.revision_rounds === 1 ? "" : "s"}).` });
    }
    return issues;
  }

  if (request.form === "short" && over(limits.short_per_month, usage.shortJobsThisMonth)) {
    issues.push({ code: "monthly_short", message: `Monthly short-form limit reached (${usage.shortJobsThisMonth}/${limits.short_per_month}).` });
  }
  if (request.form === "long" && over(limits.long_per_month, usage.longJobsThisMonth)) {
    issues.push({ code: "monthly_long", message: `Monthly long-form limit reached (${usage.longJobsThisMonth}/${limits.long_per_month}).` });
  }
  if (over(limits.videos_per_week, usage.jobsThisWeek)) {
    issues.push({ code: "weekly", message: `Weekly video limit reached (${usage.jobsThisWeek}/${limits.videos_per_week}).` });
  }
  if (over(limits.max_simultaneous_jobs, usage.activeJobs)) {
    issues.push({ code: "simultaneous", message: `Already ${usage.activeJobs} job(s) in editing (max ${limits.max_simultaneous_jobs}).` });
  }
  if (typeof limits.max_video_minutes === "number" && request.durationMinutes && request.durationMinutes > limits.max_video_minutes) {
    issues.push({ code: "duration", message: `Source is ${request.durationMinutes.toFixed(1)} min; package allows ${limits.max_video_minutes} min.` });
  }
  if (limits.included_platforms?.length && request.platforms?.length) {
    const extra = request.platforms.filter((p) => !limits.included_platforms!.includes(p));
    if (extra.length) issues.push({ code: "platform", message: `Not in package: ${extra.join(", ")}.` });
  }
  return issues;
}

/**
 * Turns limit issues into a decision according to the workspace's overage behaviour.
 * "Simultaneous" is never billable: it only delays, so it always waits for the owner.
 */
export function decideQuota(limits: PackageLimits, usage: UsageCounts, request: QuotaRequest, behavior: OverageBehavior): QuotaDecision {
  const issues = quotaIssues(limits, usage, request);
  if (!issues.length) return { outcome: "ok", issues: [] };
  if (issues.every((i) => i.code === "simultaneous")) return { outcome: "needs_owner", issues };
  switch (behavior) {
    case "block":
      return { outcome: "blocked", issues };
    case "warn":
      return { outcome: "warn", issues };
    case "require_owner_approval":
      return { outcome: "needs_owner", issues };
    case "allow_billable":
      return { outcome: "billable", issues };
  }
}

/** Month / week boundaries (UTC dates) used for counting. Weeks start Monday. */
export function periodStarts(now: Date): { monthStart: string; weekStart: string; today: string } {
  const today = now.toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const d = new Date(`${today}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return { monthStart, weekStart: d.toISOString().slice(0, 10), today };
}

export function usagePercent(used: number, limit: number | undefined): number | null {
  if (typeof limit !== "number" || limit <= 0) return null;
  return Math.min(100, Math.round((used / limit) * 100));
}
