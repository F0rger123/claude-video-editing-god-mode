"use server";

import { headers } from "next/headers";
import { getUserClient } from "@/lib/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPush, pushConfigured } from "@/lib/integrations/push";

type Sub = { endpoint: string; keys: { p256dh: string; auth: string } };

function deviceName(ua: string | null): string {
  if (!ua) return "Device";
  if (/Android/.test(ua)) return "Android phone";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Windows/.test(ua)) return "Windows PC";
  if (/Macintosh/.test(ua)) return "Mac";
  return "Device";
}

/** Save this phone's push subscription for the signed-in person (replaces an older one for the same phone). */
export async function savePushSubscription(sub: Sub): Promise<{ ok?: true; error?: string }> {
  const ctx = await getUserClient();
  if ("error" in ctx) return { error: ctx.error };
  if (!/^https:\/\//.test(sub?.endpoint ?? "") || !sub.keys?.p256dh || !sub.keys?.auth) return { error: "Your phone didn't give a valid subscription." };
  // The endpoint is unique per phone: if another account used this phone before, it moves to this one.
  const admin = createAdminClient();
  await admin.from("content_push_subscriptions").delete().eq("endpoint", sub.endpoint);
  const { error } = await ctx.supabase.from("content_push_subscriptions").insert({
    user_id: ctx.userId,
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    device: deviceName((await headers()).get("user-agent")),
  });
  if (error) return { error: "Couldn't save it. Try again." };
  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<{ ok?: true }> {
  const ctx = await getUserClient();
  if ("error" in ctx) return {};
  await ctx.supabase.from("content_push_subscriptions").delete().eq("endpoint", endpoint);
  return { ok: true };
}

/** Sends a test notification to this person's phones. */
export async function sendTestPush(): Promise<{ ok?: true; error?: string }> {
  const ctx = await getUserClient();
  if ("error" in ctx) return { error: ctx.error };
  if (!pushConfigured()) return { error: "Notifications aren't set up on the server yet." };
  const admin = createAdminClient();
  const { data: subs } = await ctx.supabase.from("content_push_subscriptions").select("id");
  if (!subs?.length) return { error: "Turn notifications on first." };
  // Reuse the real sender, addressed to this person only.
  const { data: staff } = await admin.from("content_staff").select("user_id").eq("user_id", ctx.userId).maybeSingle();
  if (staff) {
    await sendPush(admin, { kind: "edit_complete", title: "Notifications are on", body: "You'll get one like this when an edit is ready.", link: "/" });
  } else {
    const { data: member } = await admin.from("content_members").select("workspace_id").eq("user_id", ctx.userId).is("revoked_at", null).limit(1).maybeSingle();
    if (!member) return { error: "No workspace found." };
    await sendPush(admin, { kind: "edit_complete", title: "Notifications are on", body: "You'll get one like this when your video is ready.", link: "/", audience: "member", workspaceId: member.workspace_id });
  }
  return { ok: true };
}
