#!/usr/bin/env node
// LOCAL ONLY: creates throwaway test users and data in the local Supabase stack (`npx supabase start`)
// for clicking through every screen. Refuses to run against anything but 127.0.0.1 / localhost.
// Credentials are written to supabase/.audit-users.json (git-ignored).
import fs from "node:fs";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.LOCAL_SUPABASE_URL || "http://127.0.0.1:54421";
const key = process.env.LOCAL_SUPABASE_SECRET;
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(url) || !key) throw new Error("Local Supabase only (set LOCAL_SUPABASE_SECRET).");
const db = createClient(url, key, { auth: { persistSession: false } });

const pw = () => crypto.randomBytes(12).toString("base64url");
const users = { owner: { email: "audit-owner@agency.test", password: pw() }, client: { email: "audit-client@client.test", password: pw() } };
for (const u of Object.values(users)) {
  const { data: list } = await db.auth.admin.listUsers();
  const existing = list.users.find((x) => x.email === u.email);
  if (existing) await db.auth.admin.updateUserById(existing.id, { password: u.password });
  const { data } = existing ? { data: { user: existing } } : await db.auth.admin.createUser({ email: u.email, password: u.password, email_confirm: true });
  u.id = data.user.id;
}
await db.from("content_staff").upsert({ user_id: users.owner.id, role: "owner", display_name: "Audit owner" });
let { data: ws } = await db.from("content_workspaces").select("id").eq("slug", "audit-client").maybeSingle();
if (!ws) {
  ({ data: ws } = await db.from("content_workspaces").insert({
    name: "Audit Client", slug: "audit-client", access_mode: "client_collab", automation_mode: "manual",
    approval_rules: { edit_approval: true, client_review: true, caption_approval: true },
    package: { short_per_month: 8, videos_per_week: 2, revision_rounds: 2 }, scripts_enabled: true, idea_requests_per_month: 3,
    brand_profile: { about: "Deck and patio builder", voice: "Friendly, practical", cta: "Book a free quote" },
  }).select("id").single());
}
await db.from("content_members").upsert({ workspace_id: ws.id, user_id: users.client.id, invited_email: users.client.email, permissions: { can_upload: true, can_view_drafts: true, can_comment: true, can_request_changes: true, can_approve: true, can_view_calendar: true, can_view_published: true, can_download_final: true, can_view_scripts: true, can_swipe_scripts: true, can_generate_ideas: true } }, { onConflict: "workspace_id,invited_email" });
const { count } = await db.from("content_script_ideas").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id);
if (!count) {
  await db.from("content_script_ideas").insert([
    { workspace_id: ws.id, form: "short", hook: "Your deck is rotting from the bottom up. Here's how to check in 30 seconds.", script: "Grab a screwdriver. Push it into the joists under your deck...", why: "Mistake-to-avoid + quick payoff", style: "Educational / how-to", broll: "Close-up of screwdriver test; rotten vs healthy joist", caption: "Check your deck before summer. Book a free inspection." },
    { workspace_id: ws.id, form: "long", title: "Composite vs Wood Decks: 10 Years Later", hook: "We went back to two decks we built in 2016.", script: "Ten years ago we built two decks on the same street...", outline: "1. The two decks\n2. Cost then vs now\n3. Maintenance log\n4. Verdict", broll: "Drone of both decks; maintenance receipts", thumbnail_text: "10 YEARS LATER", caption: "Which deck would you pick?", why: "Before/after case study", style: "Case study / results" },
  ]);
}
fs.writeFileSync("supabase/.audit-users.json", JSON.stringify({ url, workspace: ws.id, ...users }, null, 2));
console.log("audit users ready: supabase/.audit-users.json");
