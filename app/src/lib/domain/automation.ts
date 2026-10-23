import { AGENCY_NAME } from "@/lib/brand";
import type { QuotaDecision } from "./quota";
import type { AutomationMode, ConditionalRules, JobForm, Permissions } from "./types";

/**
 * Decides what happens to a new job before any editing effort is spent.
 *
 *   manual       → Pending Approval (always)
 *   auto         → Queued when the upload is valid and quota allows
 *   conditional  → Queued only when every configured rule passes
 *   full_auto    → like auto (the agency workspace); downstream steps also auto-run
 *
 * Client uploads never start editing on their own unless the client has `can_trigger_editing`
 * or the workspace mode is not manual. Every "no" comes with readable reasons.
 */
export type IntakeFacts = {
  mode: AutomationMode;
  rules: ConditionalRules;
  form: JobForm;
  source: "agency" | "client" | "drive";
  hasPrimaryVideo: boolean;
  hasReference: boolean;
  durationMinutes: number | null;
  category: string | null;
  clientPermissions?: Permissions | null;
  quota: QuotaDecision;
};

export type IntakeDecision = {
  next: "queued" | "pending_approval";
  billable: boolean;
  reasons: string[];
};

export function decideIntake(f: IntakeFacts): IntakeDecision {
  const reasons: string[] = [];
  const hold = (why: string) => reasons.push(why);

  if (f.mode === "manual") hold("Manual approval is on for this workspace.");
  if (!f.hasPrimaryVideo) hold("No usable source video yet.");
  // A client upload only starts editing by itself when the owner has given that client
  // `can_trigger_editing`; otherwise it always waits in Pending Approval.
  if (f.source === "client" && f.mode !== "manual" && !f.clientPermissions?.can_trigger_editing) {
    hold(`Client uploads wait for ${AGENCY_NAME} in this workspace.`);
  }

  if (f.mode === "conditional") {
    const r = f.rules;
    if (r.short_form_only && f.form !== "short") hold("Only short-form starts automatically.");
    if (r.agency_uploads_only && f.source !== "agency") hold(`Only ${AGENCY_NAME} uploads start automatically.`);
    if (typeof r.max_duration_minutes === "number") {
      if (f.durationMinutes === null) hold("Duration unknown; rule needs it.");
      else if (f.durationMinutes > r.max_duration_minutes) hold(`Longer than ${r.max_duration_minutes} min.`);
    }
    if (r.require_reference && !f.hasReference) hold("A reference is required first.");
    if (r.categories?.length && (!f.category || !r.categories.includes(f.category))) hold("Category is not on the auto list.");
    if (r.trusted_client === false) hold("Client is not marked trusted.");
    if (r.require_quota && f.quota.outcome !== "ok") hold("No quota remaining.");
  }

  let billable = false;
  switch (f.quota.outcome) {
    case "blocked":
      reasons.push(...f.quota.issues.map((i) => `Blocked: ${i.message}`));
      break;
    case "needs_owner":
      reasons.push(...f.quota.issues.map((i) => `Needs owner approval: ${i.message}`));
      break;
    case "billable":
      billable = true;
      break;
    case "warn":
    case "ok":
      break;
  }

  return { next: reasons.length ? "pending_approval" : "queued", billable, reasons };
}

/**
 * After the editor returns a version: who has to look at it next?
 *   null      → nobody: approve automatically (full auto, no edit approval)
 *   "agency"  → the agency reviews first
 *   "client"  → straight to the client (agency review disabled, client review on)
 */
export function nextReviewStage(
  mode: AutomationMode,
  rules: { edit_approval?: boolean; client_review?: boolean },
  manualReviewRequested: boolean,
): "agency" | "client" | null {
  if (manualReviewRequested) return "agency";
  if (rules.edit_approval === false && !rules.client_review) return mode === "full_auto" || mode === "auto" ? null : "agency";
  if (rules.edit_approval === false && rules.client_review) return "client";
  return "agency";
}
