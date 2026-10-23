import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { tick } from "@/lib/workflow";

/**
 * Background pass: intake, review routing, Buffer sends, publish tracking, health checks.
 * Called every 5 minutes by the Worker cron (worker.ts) and by the editing-PC bridge after it
 * changes something. Authenticated with `Authorization: Bearer <CRON_SECRET>`.
 */
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
  if (!isAdminConfigured()) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY missing" }, { status: 500 });
  try {
    const report = await tick(createAdminClient());
    return NextResponse.json({ ok: true, report });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
