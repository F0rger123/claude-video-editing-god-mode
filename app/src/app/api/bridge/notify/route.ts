import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { notify, type NotificationKind } from "@/lib/integrations/notify";

/**
 * The editing-PC bridge reports events that happen only on the PC (an edit failed, the editor is
 * paused) as normal notifications, so they reach the app and phones like any other.
 * Authenticated with `Authorization: Bearer <CRON_SECRET>`.
 */
const KINDS: NotificationKind[] = ["edit_failed", "needs_attention", "edit_complete"];

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdminConfigured()) return NextResponse.json({ error: "not configured" }, { status: 500 });
  const body = (await request.json().catch(() => null)) as { kind?: string; title?: string; body?: string; link?: string; workspaceId?: string; jobId?: string } | null;
  if (!body?.title || !KINDS.includes(body.kind as NotificationKind)) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const uuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
  await notify(createAdminClient(), {
    kind: body.kind as NotificationKind,
    title: body.title.slice(0, 200),
    body: body.body?.slice(0, 1000) ?? null,
    link: body.link && body.link.startsWith("/") ? body.link : null,
    workspaceId: uuid(body.workspaceId),
    jobId: uuid(body.jobId),
  });
  return NextResponse.json({ ok: true });
}
