"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getStaffClient, cleanError } from "@/lib/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET, paths } from "@/lib/integrations/storage";
import { syncChannels } from "@/lib/workflow";
import { audit } from "@/lib/integrations/notify";
import { normalizePermissions, permissionsFromForm, presetPermissions } from "@/lib/domain/permissions";
import { platformFromService } from "@/lib/integrations/buffer";
import { PLATFORMS, type AccessMode, type ScheduleRules } from "@/lib/domain/types";
import { slugify } from "@/lib/format";
import type { ActionState } from "@/lib/forms";

const UUID = /^[0-9a-f-]{36}$/i;
const num = (fd: FormData, name: string) => {
  const raw = String(fd.get(name) ?? "").trim();
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
};
const text = (fd: FormData, name: string, max = 2000) => String(fd.get(name) ?? "").trim().slice(0, max);

/** Reads the shared client settings form into a workspace row. */
function readWorkspace(fd: FormData) {
  const accessMode = (["agency_only", "client_upload", "client_collab"].includes(String(fd.get("access_mode"))) ? fd.get("access_mode") : "agency_only") as AccessMode;
  const windows = text(fd, "windows")
    .split(/[,\n]/)
    .map((w) => w.trim().match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/))
    .filter(Boolean)
    .map((m) => ({ start: m![1].padStart(5, "0"), end: m![2].padStart(5, "0") }));
  const schedule: ScheduleRules = {
    preferred_days: fd.getAll("days").map(Number).filter((d) => d >= 0 && d <= 6),
    windows,
    min_gap_minutes: num(fd, "min_gap_minutes"),
    max_posts_per_day: num(fd, "max_posts_per_day"),
    max_posts_per_week: num(fd, "max_posts_per_week"),
    blackout_dates: text(fd, "blackout").split(/[\s,]+/).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
  };
  return {
    name: text(fd, "name", 120),
    contact_email: text(fd, "contact_email", 200) || null,
    editor_brand_folder: text(fd, "editor_brand_folder", 120) || null,
    timezone: text(fd, "timezone", 60) || "America/New_York",
    allowed_platforms: fd.getAll("platforms").map(String).filter((p) => (PLATFORMS as readonly string[]).includes(p)),
    access_mode: accessMode,
    automation_mode: ["manual", "auto", "conditional", "full_auto"].includes(String(fd.get("automation_mode"))) ? String(fd.get("automation_mode")) : "manual",
    conditional_rules: {
      require_quota: fd.get("rule_require_quota") === "on",
      short_form_only: fd.get("rule_short_only") === "on",
      agency_uploads_only: fd.get("rule_agency_only") === "on",
      max_duration_minutes: num(fd, "rule_max_minutes"),
      require_reference: fd.get("rule_require_reference") === "on",
      categories: text(fd, "rule_categories").split(",").map((c) => c.trim()).filter(Boolean),
      trusted_client: fd.get("rule_trusted") === "on",
    },
    default_permissions: permissionsFromForm(fd),
    package: {
      short_per_month: num(fd, "short_per_month"),
      long_per_month: num(fd, "long_per_month"),
      videos_per_week: num(fd, "videos_per_week"),
      revision_rounds: num(fd, "revision_rounds"),
      max_video_minutes: num(fd, "max_video_minutes"),
      max_simultaneous_jobs: num(fd, "max_simultaneous_jobs"),
      turnaround_days: num(fd, "turnaround_days"),
    },
    overage_behavior: ["block", "warn", "require_owner_approval", "allow_billable"].includes(String(fd.get("overage_behavior"))) ? String(fd.get("overage_behavior")) : "require_owner_approval",
    approval_rules: {
      edit_approval: fd.get("edit_approval") === "on",
      caption_approval: fd.get("caption_approval") === "on",
      final_post_approval: fd.get("final_post_approval") === "on",
      client_review: fd.get("client_review") === "on",
    },
    schedule_rules: schedule,
    posting_frequency: text(fd, "posting_frequency", 200) || null,
    default_post_timing: ["auto_slot", "after_edit", "fixed"].includes(String(fd.get("default_post_timing"))) ? String(fd.get("default_post_timing")) : "auto_slot",
    default_post_time: /^\d{2}:\d{2}$/.test(text(fd, "default_post_time")) ? text(fd, "default_post_time") : null,
    scripts_enabled: fd.get("scripts_enabled") === "on",
    scripts_per_batch: Math.min(20, Math.max(1, num(fd, "scripts_per_batch") ?? 6)),
    ideas_per_request: Math.min(10, Math.max(1, num(fd, "ideas_per_request") ?? 5)),
    idea_requests_per_month: Math.min(500, num(fd, "idea_requests_per_month") ?? 4),
    brand_profile: {
      about: text(fd, "brand_about"),
      handle: text(fd, "brand_handle", 200),
      voice: text(fd, "brand_voice"),
      colors: text(fd, "brand_colors", 500),
      fonts: text(fd, "brand_fonts", 500),
      always: text(fd, "brand_always"),
      never: text(fd, "brand_never"),
      cta: text(fd, "brand_cta", 300),
      hashtags: text(fd, "brand_hashtags", 500),
    },
  };
}

async function uploadLogo(fd: FormData, workspaceId: string): Promise<string | null> {
  const file = fd.get("logo");
  if (!(file instanceof File) || !file.size) return null;
  if (file.size > 1.5 * 1024 * 1024 || !file.type.startsWith("image/")) throw new Error("Logo must be an image under 1.5 MB.");
  const admin = createAdminClient();
  const path = paths.brand(workspaceId, file.name);
  const { error } = await admin.storage.from(BUCKET).upload(path, file, { contentType: file.type });
  if (error) throw new Error(error.message);
  return path;
}

export async function createClientWorkspace(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getStaffClient();
  if ("error" in ctx) return ctx;
  const row = readWorkspace(fd);
  if (!row.name) return { error: "Client name is required." };
  const slug = slugify(text(fd, "slug") || row.name);
  const { data, error } = await ctx.supabase.from("content_workspaces").insert({ ...row, slug, editor_brand_folder: row.editor_brand_folder ?? row.name }).select("id").single();
  if (error || !data) return { error: /duplicate key/.test(error?.message ?? "") ? "A client with that link name already exists." : cleanError(error?.message) };
  try {
    const logo = await uploadLogo(fd, data.id);
    if (logo) await ctx.supabase.from("content_workspaces").update({ logo_path: logo }).eq("id", data.id);
  } catch (e) {
    return { error: `Client created, but the logo failed: ${(e as Error).message}` };
  }
  await audit(createAdminClient(), { workspaceId: data.id, actorId: ctx.userId, actorLabel: ctx.role, action: "client_created", entity: "workspace", entityId: data.id });
  revalidatePath("/clients");
  redirect(`/clients/${data.id}?created=1`);
}

export async function updateClientWorkspace(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getStaffClient();
  if ("error" in ctx) return ctx;
  const id = String(fd.get("id"));
  if (!UUID.test(id)) return { error: "Unknown client." };
  const row = readWorkspace(fd);
  if (!row.name) return { error: "Client name is required." };
  try {
    const logo = await uploadLogo(fd, id);
    const { error, count } = await ctx.supabase.from("content_workspaces").update({ ...row, ...(logo ? { logo_path: logo } : {}) }, { count: "exact" }).eq("id", id);
    if (error) return { error: cleanError(error.message) };
    if (!count) return { error: "Client not found." };
  } catch (e) {
    return { error: (e as Error).message };
  }
  await audit(createAdminClient(), { workspaceId: id, actorId: ctx.userId, actorLabel: ctx.role, action: "client_settings_changed", entity: "workspace", entityId: id });
  revalidatePath(`/clients/${id}`);
  return { success: "Saved." };
}

export async function archiveClient(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getStaffClient();
  if ("error" in ctx) return ctx;
  if (ctx.role !== "owner") return { error: "Only the owner can archive a client." };
  const id = String(fd.get("id"));
  const archive = fd.get("archive") === "1";
  await ctx.supabase.from("content_workspaces").update({ archived_at: archive ? new Date().toISOString() : null }).eq("id", id).eq("is_agency", false);
  if (archive) await ctx.supabase.from("content_members").update({ revoked_at: new Date().toISOString() }).eq("workspace_id", id).is("revoked_at", null);
  revalidatePath("/clients");
  return { success: archive ? "Client archived and portal access revoked." : "Client restored. Re-enable members individually." };
}

// ── Portal members ──────────────────────────────────────────────────────

export async function inviteMember(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getStaffClient();
  if ("error" in ctx) return ctx;
  const id = String(fd.get("id"));
  const email = text(fd, "email", 200).toLowerCase();
  if (!UUID.test(id) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email." };
  const { data: ws } = await ctx.supabase.from("content_workspaces").select("slug, access_mode, default_permissions").eq("id", id).single();
  if (!ws) return { error: "Client not found." };
  if (ws.access_mode === "agency_only") return { error: "This client is Agency only. Switch access to Client upload or Collaboration first." };
  const admin = createAdminClient();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const redirectTo = `${site}/auth/callback?next=${encodeURIComponent(`/portal/${ws.slug}`)}`;
  // Existing account → just link; new email → Supabase sends the invitation.
  let userId: string | null = null;
  const invited = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (invited.data.user) userId = invited.data.user.id;
  else if (/already been registered|already exists/i.test(invited.error?.message ?? "")) {
    const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo } });
    userId = data.user?.id ?? null;
  } else if (invited.error) return { error: invited.error.message };
  const perms = { ...presetPermissions(ws.access_mode as AccessMode), ...normalizePermissionsPartial(ws.default_permissions) };
  const { error } = await admin.from("content_members").upsert({ workspace_id: id, invited_email: email, user_id: userId, permissions: perms, revoked_at: null }, { onConflict: "workspace_id,invited_email" });
  if (error) return { error: cleanError(error.message) };
  await audit(admin, { workspaceId: id, actorId: ctx.userId, actorLabel: ctx.role, action: "portal_invited", entity: "member", detail: { email } });
  revalidatePath(`/clients/${id}`);
  return { success: `Invitation sent to ${email}.` };
}

function normalizePermissionsPartial(raw: unknown) {
  const p = normalizePermissions(raw);
  return Object.fromEntries(Object.entries(p).filter(([, v]) => v));
}

export async function updateMember(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getStaffClient();
  if ("error" in ctx) return ctx;
  const memberId = String(fd.get("member"));
  if (!UUID.test(memberId)) return { error: "Unknown member." };
  const intent = String(fd.get("intent"));
  const patch =
    intent === "revoke" ? { revoked_at: new Date().toISOString() } : intent === "restore" ? { revoked_at: null } : { permissions: permissionsFromForm(fd) };
  const { data, error } = await ctx.supabase.from("content_members").update(patch).eq("id", memberId).select("workspace_id, invited_email").single();
  if (error || !data) return { error: cleanError(error?.message) };
  await audit(createAdminClient(), { workspaceId: data.workspace_id, actorId: ctx.userId, actorLabel: ctx.role, action: `portal_${intent}`, entity: "member", entityId: memberId, detail: { email: data.invited_email } });
  revalidatePath(`/clients/${data.workspace_id}`);
  return { success: intent === "revoke" ? "Access revoked." : intent === "restore" ? "Access restored." : "Permissions saved." };
}

// ── Buffer channels ─────────────────────────────────────────────────────

export async function saveBufferKey(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getStaffClient();
  if ("error" in ctx) return ctx;
  if (ctx.role !== "owner") return { error: "Only the owner can change Buffer keys." };
  const id = String(fd.get("id"));
  const key = text(fd, "buffer_key", 500);
  if (!UUID.test(id)) return { error: "Unknown client." };
  const admin = createAdminClient();
  if (!key) await admin.from("content_secrets").delete().eq("workspace_id", id).eq("kind", "buffer_api_key");
  else await admin.from("content_secrets").upsert({ workspace_id: id, kind: "buffer_api_key", value: key, updated_at: new Date().toISOString() });
  await audit(admin, { workspaceId: id, actorId: ctx.userId, actorLabel: ctx.role, action: key ? "buffer_key_set" : "buffer_key_removed", entity: "workspace", entityId: id });
  revalidatePath(`/clients/${id}`);
  return { success: key ? "Client Buffer key saved (never shown again)." : "Using the agency Buffer account." };
}

export async function mapChannel(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getStaffClient();
  if ("error" in ctx) return ctx;
  const id = String(fd.get("id"));
  const channel = String(fd.get("channel"));
  const intent = String(fd.get("intent"));
  if (!UUID.test(id)) return { error: "Unknown client." };
  const admin = createAdminClient();
  if (intent === "unmap") {
    await ctx.supabase.from("content_channels").delete().eq("workspace_id", id).eq("buffer_channel_id", channel);
    revalidatePath(`/clients/${id}`);
    return { success: "Channel removed from this client." };
  }
  const { channels } = await syncChannels(admin, id).catch((e) => ({ channels: [], error: e as Error }));
  const remote = channels.find((c) => c.id === channel);
  if (!remote) return { error: "That channel was not found in Buffer. Check the Buffer key." };
  const { error } = await ctx.supabase.from("content_channels").insert({
    workspace_id: id,
    buffer_channel_id: remote.id,
    buffer_org_id: remote.organizationId,
    platform: platformFromService(remote.platform),
    name: remote.name,
    avatar_url: remote.avatarUrl,
    is_disconnected: remote.isDisconnected,
    synced_at: new Date().toISOString(),
  });
  if (error) return { error: /duplicate key/.test(error.message) ? "That channel already belongs to another client. A channel can only post for one client." : cleanError(error.message) };
  await audit(admin, { workspaceId: id, actorId: ctx.userId, actorLabel: ctx.role, action: "channel_mapped", entity: "workspace", entityId: id, detail: { channel: remote.name, platform: remote.platform } });
  revalidatePath(`/clients/${id}`);
  return { success: `${remote.name} now posts for this client only.` };
}
