import type { JobStatus } from "./types";

/**
 * Allowed job transitions. Anything not listed is refused by `assertTransition`,
 * so a stale tab or a forged request cannot jump a job past review.
 * `failed` and `archived` are reachable from (almost) everywhere.
 */
const NEXT: Record<JobStatus, JobStatus[]> = {
  incoming: ["pending_approval", "queued"],
  pending_approval: ["queued", "incoming"],
  queued: ["editing", "pending_approval"],
  editing: ["rendering", "review", "queued"],
  rendering: ["review", "editing", "queued"],
  review: ["approved", "needs_changes", "queued", "pending_approval"],
  needs_changes: ["queued", "review"],
  approved: ["scheduled", "review", "needs_changes", "published"],
  scheduled: ["publishing", "published", "approved"],
  publishing: ["published", "scheduled"],
  published: [],
  failed: ["queued", "pending_approval", "review", "approved"],
  archived: ["incoming", "pending_approval"],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  if (from === to) return true;
  if (to === "archived") return true;
  if (to === "failed") return from !== "published" && from !== "archived";
  return NEXT[from].includes(to);
}

export function assertTransition(from: JobStatus, to: JobStatus): void {
  if (!canTransition(from, to)) throw new Error(`A job cannot move from ${from} to ${to}.`);
}

/** Statuses during which the editor is (about to be) spending Claude usage. */
export const ACTIVE_EDIT_STATUSES: JobStatus[] = ["queued", "editing", "rendering"];

/** Statuses that count as "the editor has been asked to work on it" for quota purposes. */
export const COUNTED_EDIT_STATUSES: JobStatus[] = [
  "queued",
  "editing",
  "rendering",
  "review",
  "needs_changes",
  "approved",
  "scheduled",
  "publishing",
  "published",
];

/** Simple tone for status pills: neutral grayscale, plus semantic colour only where it matters. */
export function statusTone(status: JobStatus): "neutral" | "active" | "attention" | "danger" | "success" | "muted" {
  switch (status) {
    case "failed":
      return "danger";
    case "pending_approval":
    case "review":
    case "needs_changes":
      return "attention";
    case "queued":
    case "editing":
    case "rendering":
    case "publishing":
      return "active";
    case "published":
      return "success";
    case "archived":
      return "muted";
    default:
      return "neutral";
  }
}
