import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getStaffClient } from "@/lib/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/integrations/notify";
import { YouTubeClient, youtubeApp, youtubeChannelKey } from "@/lib/integrations/youtube";

/**
 * Google sends the person back here after they pick a YouTube channel. Checks the one-time state,
 * swaps the code for a refresh token, and connects every channel that Google account chose to the
 * workspace that started the flow. A channel already used by another client is refused.
 */
function sameState(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const [state, ws] = (request.cookies.get("azc-yt-oauth")?.value ?? "").split(".");
  const back = (result: string) => {
    const url = new URL(ws ? `/clients/${ws}?tab=channels` : "/clients", request.url);
    url.searchParams.set("yt", result);
    const res = NextResponse.redirect(url);
    res.cookies.delete({ name: "azc-yt-oauth", path: "/api/youtube" });
    return res;
  };
  if (!state || !ws || !sameState(state, params.get("state") ?? "")) return back("expired");
  if (params.get("error")) return back("cancelled");
  const ctx = await getStaffClient();
  if ("error" in ctx) return NextResponse.redirect(new URL("/no-access", request.url));
  const app = youtubeApp();
  const code = params.get("code");
  if (!app || !code) return back("not-set-up");

  const client = new YouTubeClient(app);
  try {
    const token = await client.exchangeCode(code, new URL("/api/youtube/callback", request.url).toString());
    if (!token.refreshToken) return back("no-offline");
    if (!token.scope.includes("youtube.upload")) return back("no-upload");
    const channels = await client.myChannels(token.accessToken);
    if (!channels.length) return back("no-channel");
    const admin = createAdminClient();
    let connected = 0;
    let taken = 0;
    for (const c of channels) {
      const key = youtubeChannelKey(c.id);
      const { data: existing } = await admin.from("content_channels").select("id, workspace_id").eq("buffer_channel_id", key).maybeSingle();
      if (existing && existing.workspace_id !== ws) {
        taken++;
        continue;
      }
      const row = { workspace_id: ws, buffer_channel_id: key, provider: "youtube", platform: "youtube", name: c.title, avatar_url: c.avatarUrl, is_disconnected: false, enabled: true, synced_at: new Date().toISOString() };
      const { data: saved, error } = existing
        ? await admin.from("content_channels").update(row).eq("id", existing.id).select("id").single()
        : await admin.from("content_channels").insert(row).select("id").single();
      if (error || !saved) continue;
      await admin.from("content_channel_tokens").upsert({ channel_id: saved.id, refresh_token: token.refreshToken, scope: token.scope, updated_at: new Date().toISOString() });
      await audit(admin, { workspaceId: ws, actorId: ctx.userId, actorLabel: ctx.role, action: "youtube_connected", entity: "workspace", entityId: ws, detail: { channel: c.title } });
      connected++;
    }
    return back(connected ? "connected" : taken ? "taken" : "failed");
  } catch (e) {
    console.error("youtube connect failed", (e as Error).message);
    return back("failed");
  }
}
