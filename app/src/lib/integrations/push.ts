import "server-only";
import { buildPushHTTPRequest } from "@pushforge/builder";
import type { AdminClient } from "@/lib/supabase/admin";
import type { NotifyInput } from "./notify";

/**
 * Phone notifications (Web Push). Sent from the app server the moment a notification is created,
 * to every phone the recipients turned notifications on for. Works in the Android app (shown as
 * the app's own notification), Chrome, and iPhone home-screen apps (iOS 16.4+).
 * Needs VAPID_PRIVATE_JWK (server secret) and NEXT_PUBLIC_VAPID_PUBLIC_KEY (the phone side).
 */
export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PRIVATE_JWK && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
}

async function recipients(admin: AdminClient, n: NotifyInput): Promise<string[]> {
  if ((n.audience ?? "staff") === "member") {
    if (!n.workspaceId) return [];
    const { data } = await admin.from("content_members").select("user_id").eq("workspace_id", n.workspaceId).is("revoked_at", null).not("user_id", "is", null);
    return (data ?? []).map((r) => r.user_id as string);
  }
  const { data } = await admin.from("content_staff").select("user_id");
  return (data ?? []).map((r) => r.user_id as string);
}

export async function sendPush(admin: AdminClient, n: NotifyInput): Promise<void> {
  if (!pushConfigured()) return;
  const users = await recipients(admin, n);
  if (!users.length) return;
  const { data: subs } = await admin.from("content_push_subscriptions").select("id, endpoint, p256dh, auth").in("user_id", users);
  if (!subs?.length) return;
  const payload = { title: n.title, body: n.body ?? "", url: n.link ?? "/", tag: `${n.kind}:${n.jobId ?? n.workspaceId ?? ""}` };
  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        const req = await buildPushHTTPRequest({
          privateJWK: process.env.VAPID_PRIVATE_JWK!,
          subscription: { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          message: { payload, adminContact: `mailto:${process.env.PUSH_CONTACT_EMAIL || "admin@example.com"}`, options: { ttl: 86400, urgency: n.kind === "publish_failed" || n.kind === "edit_failed" ? "high" : "normal", topic: n.kind.replace(/_/g, "").slice(0, 32) } },
        });
        const res = await fetch(req.endpoint, { method: "POST", headers: req.headers, body: req.body });
        // 404 / 410: that phone uninstalled the app or turned notifications off. Forget it.
        if (res.status === 404 || res.status === 410) await admin.from("content_push_subscriptions").delete().eq("id", s.id);
        else if (res.ok) await admin.from("content_push_subscriptions").update({ last_sent_at: new Date().toISOString() }).eq("id", s.id);
        else console.error("push failed", res.status, await res.text().catch(() => ""));
      } catch (e) {
        console.error("push error", (e as Error).message);
      }
    }),
  );
}
