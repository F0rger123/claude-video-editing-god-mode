import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getStaffClient } from "@/lib/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/integrations/notify";
import { InstagramClient, instagramApp, instagramChannelKey } from "@/lib/integrations/instagram";

/**
 * Instagram sends the person back here after they approve. Checks the one-time state, swaps the code
 * for a 60-day token, and connects that Instagram account to the workspace that started the flow.
 * An account already used by another client is refused; personal accounts can't publish.
 */
function sameState(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const [state, ws] = (request.cookies.get("azc-ig-oauth")?.value ?? "").split(".");
  const back = (result: string) => {
    const url = new URL(ws ? `/clients/${ws}?tab=channels` : "/clients", request.url);
    url.searchParams.set("ig", result);
    const res = NextResponse.redirect(url);
    res.cookies.delete({ name: "azc-ig-oauth", path: "/api/instagram" });
    return res;
  };
  if (!state || !ws || !sameState(state, (params.get("state") ?? "").replace(/#_$/, ""))) return back("expired");
  if (params.get("error")) return back("cancelled");
  const ctx = await getStaffClient();
  if ("error" in ctx) return NextResponse.redirect(new URL("/no-access", request.url));
  const app = instagramApp();
  const code = params.get("code");
  if (!app || !code) return back("not-set-up");

  const client = new InstagramClient(app);
  try {
    const t = await client.exchangeCode(code, new URL("/api/instagram/callback", request.url).toString());
    if (t.permissions.length && !t.permissions.includes("instagram_business_content_publish")) return back("no-publish");
    const me = await client.me(t.token);
    if (me.accountType && !/BUSINESS|CREATOR|MEDIA_CREATOR/i.test(me.accountType)) return back("personal");
    const admin = createAdminClient();
    const key = instagramChannelKey(t.userId || me.userId);
    const { data: existing } = await admin.from("content_channels").select("id, workspace_id").eq("buffer_channel_id", key).maybeSingle();
    if (existing && existing.workspace_id !== ws) return back("taken");
    const row = { workspace_id: ws, buffer_channel_id: key, provider: "instagram", platform: "instagram", name: `@${me.username}`, avatar_url: me.avatarUrl, is_disconnected: false, enabled: true, synced_at: new Date().toISOString() };
    const { data: saved, error } = existing
      ? await admin.from("content_channels").update(row).eq("id", existing.id).select("id").single()
      : await admin.from("content_channels").insert(row).select("id").single();
    if (error || !saved) return back("failed");
    await admin.from("content_channel_tokens").upsert({ channel_id: saved.id, refresh_token: t.token, expires_at: t.expiresAt, scope: t.permissions.join(","), updated_at: new Date().toISOString() });
    await audit(admin, { workspaceId: ws, actorId: ctx.userId, actorLabel: ctx.role, action: "instagram_connected", entity: "workspace", entityId: ws, detail: { account: me.username } });
    return back("connected");
  } catch (e) {
    console.error("instagram connect failed", (e as Error).message);
    return back("failed");
  }
}
