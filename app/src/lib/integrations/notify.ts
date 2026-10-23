import "server-only";
import type { AdminClient } from "@/lib/supabase/admin";

/**
 * Notification adapter. Every notification is first a row in content_notifications (in-app).
 * Delivery channels (PWA push, email, ntfy) read those rows; adding one never touches callers.
 * Today: in-app for everyone; the local bridge also mirrors staff alerts to the owner's ntfy topic.
 */
export type NotificationKind =
  | "client_upload"
  | "edit_complete"
  | "approval_needed"
  | "client_feedback"
  | "publish_failed"
  | "integration_disconnected"
  | "quota_reached"
  | "edit_failed"
  | "needs_attention"
  | "published";

export type NotifyInput = {
  kind: NotificationKind;
  title: string;
  body?: string | null;
  link?: string | null;
  workspaceId?: string | null;
  jobId?: string | null;
  audience?: "staff" | "member";
};

export interface DeliveryChannel {
  name: string;
  deliver(n: NotifyInput): Promise<void>;
}

const channels: DeliveryChannel[] = [];
export function registerChannel(channel: DeliveryChannel) {
  channels.push(channel);
}

export async function notify(admin: AdminClient, n: NotifyInput): Promise<void> {
  const { error } = await admin.from("content_notifications").insert({
    workspace_id: n.workspaceId ?? null,
    audience: n.audience ?? "staff",
    kind: n.kind,
    title: n.title.slice(0, 200),
    body: n.body?.slice(0, 1000) ?? null,
    link: n.link ?? null,
    job_id: n.jobId ?? null,
  });
  if (error) console.error("notify failed", error.message);
  await Promise.allSettled(channels.map((c) => c.deliver(n)));
}

export async function audit(
  admin: AdminClient,
  entry: { workspaceId: string | null; actorId?: string | null; actorLabel?: string; action: string; entity: string; entityId?: string | null; detail?: Record<string, unknown> },
) {
  await admin.from("content_audit").insert({
    workspace_id: entry.workspaceId,
    actor_id: entry.actorId ?? null,
    actor_label: entry.actorLabel ?? null,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entityId ?? null,
    detail: entry.detail ?? {},
  });
}
