import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { getStaffClient } from "@/lib/actions";
import { authUrl, instagramApp } from "@/lib/integrations/instagram";

/**
 * Starts "Connect Instagram" for one workspace: staff only. The workspace id and a one-time state
 * travel in an httpOnly cookie, so the callback can't be pointed at another client by editing the URL.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const ws = request.nextUrl.searchParams.get("ws") ?? "";
  const back = new URL(`/clients/${UUID.test(ws) ? ws : ""}?tab=channels`, request.url);
  const ctx = await getStaffClient();
  if ("error" in ctx) return NextResponse.redirect(new URL("/no-access", request.url));
  if (!UUID.test(ws)) return NextResponse.redirect(new URL("/clients", request.url));
  const { data: workspace } = await ctx.supabase.from("content_workspaces").select("id").eq("id", ws).maybeSingle();
  if (!workspace) return NextResponse.redirect(new URL("/clients", request.url));
  const app = instagramApp();
  if (!app) {
    back.searchParams.set("ig", "not-set-up");
    return NextResponse.redirect(back);
  }
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(authUrl(app, new URL("/api/instagram/callback", request.url).toString(), state));
  res.cookies.set("azc-ig-oauth", `${state}.${ws}`, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/instagram", maxAge: 600 });
  return res;
}
