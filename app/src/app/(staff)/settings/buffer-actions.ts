"use server";

import { revalidatePath } from "next/cache";
import { getStaffClient } from "@/lib/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { BufferAdapter, PublishingError } from "@/lib/integrations/buffer";
import { audit } from "@/lib/integrations/notify";
import type { ActionState } from "@/lib/forms";

/**
 * Connect (or replace / disconnect) the agency's Buffer account from the app. The key is tested
 * against Buffer first, then stored server-side only (content_secrets: no API access for anyone).
 * Every client's social accounts that are in this Buffer account then show up on their Channels tab.
 */
export async function connectBuffer(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await getStaffClient();
  if ("error" in ctx) return ctx;
  if (ctx.role !== "owner") return { error: "Only the owner can connect Buffer." };
  const admin = createAdminClient();
  const { data: agency } = await admin.from("content_workspaces").select("id").eq("is_agency", true).single();
  if (!agency) return { error: "Agency workspace missing." };

  if (fd.get("intent") === "disconnect") {
    await admin.from("content_secrets").delete().eq("workspace_id", agency.id).eq("kind", "buffer_api_key");
    await admin.from("content_integrations").delete().eq("kind", "buffer").is("workspace_id", null);
    await audit(admin, { workspaceId: agency.id, actorId: ctx.userId, actorLabel: ctx.role, action: "buffer_disconnected", entity: "workspace", entityId: agency.id });
    revalidatePath("/settings");
    return { success: "Buffer disconnected. Nothing will be sent to Buffer until you connect again." };
  }

  const key = String(fd.get("key") ?? "").trim();
  if (key.length < 10) return { error: "Paste the API key from Buffer." };
  let count = 0;
  try {
    count = (await new BufferAdapter(key).listChannels()).length;
  } catch (e) {
    const err = e as PublishingError;
    return { error: err.kind === "auth" ? "Buffer rejected that key. Copy it again from developers.buffer.com → Get API Key." : `Buffer could not be reached: ${err.message}` };
  }
  await admin.from("content_secrets").upsert({ workspace_id: agency.id, kind: "buffer_api_key", value: key, updated_at: new Date().toISOString() });
  const row = { kind: "buffer", workspace_id: null, status: "ok", last_seen_at: new Date().toISOString(), detail: { channels: count }, updated_at: new Date().toISOString() };
  const { data: existing } = await admin.from("content_integrations").select("id").eq("kind", "buffer").is("workspace_id", null).maybeSingle();
  if (existing) await admin.from("content_integrations").update(row).eq("id", existing.id);
  else await admin.from("content_integrations").insert(row);
  await audit(admin, { workspaceId: agency.id, actorId: ctx.userId, actorLabel: ctx.role, action: "buffer_connected", entity: "workspace", entityId: agency.id, detail: { channels: count } });
  revalidatePath("/settings");
  return { success: `Buffer connected: ${count} social account${count === 1 ? "" : "s"} found. Assign them to clients on each client's Channels tab.` };
}
