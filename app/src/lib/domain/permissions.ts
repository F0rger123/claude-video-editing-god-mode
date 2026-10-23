import type { AccessMode, Permissions } from "./types";

export const PERMISSION_KEYS = [
  "can_upload",
  "can_view_drafts",
  "can_comment",
  "can_request_changes",
  "can_approve",
  "can_view_calendar",
  "can_view_published",
  "can_download_final",
  "can_trigger_editing",
  "can_view_scripts",
  "can_swipe_scripts",
  "can_generate_ideas",
] as const satisfies readonly (keyof Permissions)[];

export const PERMISSION_LABEL: Record<keyof Permissions, string> = {
  can_upload: "Upload media",
  can_view_drafts: "View drafts",
  can_comment: "Comment",
  can_request_changes: "Request changes",
  can_approve: "Approve",
  can_view_calendar: "View calendar",
  can_view_published: "View published",
  can_download_final: "Download finals",
  can_trigger_editing: "Start editing from uploads",
  can_view_scripts: "See script ideas",
  can_swipe_scripts: "Swipe and save script ideas",
  can_generate_ideas: "Ask Claude for content ideas (monthly limit)",
};

const NONE: Permissions = {
  can_upload: false,
  can_view_drafts: false,
  can_comment: false,
  can_request_changes: false,
  can_approve: false,
  can_view_calendar: false,
  can_view_published: false,
  can_download_final: false,
  can_trigger_editing: false,
  can_view_scripts: false,
  can_swipe_scripts: false,
  can_generate_ideas: false,
};

/** Starting permissions for each access mode. Every flag can still be toggled per client afterwards. */
export function presetPermissions(mode: AccessMode): Permissions {
  switch (mode) {
    case "agency_only":
      return { ...NONE };
    case "client_upload":
      return { ...NONE, can_upload: true };
    case "client_collab":
      return {
        ...NONE,
        can_upload: true,
        can_view_drafts: true,
        can_comment: true,
        can_request_changes: true,
        can_approve: true,
        can_view_calendar: true,
        can_view_published: true,
        can_download_final: true,
        can_view_scripts: true,
        can_swipe_scripts: true,
        can_generate_ideas: true,
      };
  }
}

/** Normalises a stored jsonb permission object: unknown keys dropped, missing keys false. */
export function normalizePermissions(raw: unknown): Permissions {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = { ...NONE };
  for (const key of PERMISSION_KEYS) out[key] = source[key] === true;
  return out;
}

export function permissionsFromForm(formData: FormData, prefix = "perm_"): Permissions {
  const out = { ...NONE };
  for (const key of PERMISSION_KEYS) out[key] = formData.get(`${prefix}${key}`) === "on";
  return out;
}
