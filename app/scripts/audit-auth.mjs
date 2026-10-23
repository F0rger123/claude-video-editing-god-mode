#!/usr/bin/env node
// LOCAL self-audit: fingerprint sign-in (virtual authenticator), forgot password (Mailpit),
// and the calendar post sheet. Local Supabase + local dev server only.
//   node scripts/audit-auth.mjs
import fs from "node:fs";
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const base = "http://localhost:3107";
const mailpit = "http://127.0.0.1:54424";
const creds = JSON.parse(fs.readFileSync("supabase/.audit-users.json", "utf8"));
if (!/127\.0\.0\.1|localhost/.test(creds.url)) throw new Error("Local only.");
const db = createClient(creds.url, process.env.LOCAL_SUPABASE_SECRET, { auth: { persistSession: false } });
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

// Production builds open screens from the phone's stored copy first; wait for the live data.
function waitFresh(page) {
  const settle = () => page.waitForFunction(() => document.documentElement.dataset.fresh === "1", null, { timeout: 20000 }).catch(() => {});
  for (const name of ["goto", "reload"]) {
    const original = page[name].bind(page);
    page[name] = async (...args) => {
      const response = await original(...args);
      await settle();
      return response;
    };
  }
  return page;
}

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const phone = () => browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

// ── Fingerprint sign-in ──
{
  const { data: owner } = await db.auth.admin.listUsers();
  const ownerId = owner.users.find((u) => u.email === creds.owner.email)?.id;
  await db.from("content_passkeys").delete().eq("user_id", ownerId);
  const ctx = await phone();
  const page = waitFresh(await ctx.newPage());
  page.on("pageerror", (e) => check("no page errors (passkey)", false, e.message.slice(0, 120)));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.goto(`${base}/login`);
  await page.getByRole("button", { name: /fingerprint or face/ }).waitFor({ timeout: 10000 });
  check("login offers fingerprint sign-in on a phone that has it", true);
  await page.locator('input[type="email"]').fill(creds.owner.email);
  await page.locator('input[type="password"]').fill(creds.owner.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const offer = page.getByRole("dialog", { name: "Faster sign-in" });
  await offer.waitFor({ timeout: 10000 });
  check("after password sign-in, offers to turn fingerprint on", true);
  await offer.getByRole("button", { name: "Turn it on" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 });
  const { data: keys } = await db.from("content_passkeys").select("device_name, counter").eq("user_id", ownerId);
  check("passkey saved for the owner", keys?.length === 1, JSON.stringify(keys));

  // Sign out (drop cookies), then sign in with the fingerprint only.
  await ctx.clearCookies();
  await page.goto(`${base}/login`);
  await page.getByRole("button", { name: /Sign in with fingerprint or face/ }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 });
  check("fingerprint alone signs the owner in", !new URL(page.url()).pathname.startsWith("/login"), page.url());
  const { data: used } = await db.from("content_passkeys").select("last_used_at").eq("user_id", ownerId).single();
  check("sign-in recorded on the passkey", Boolean(used?.last_used_at));
  await page.goto(`${base}/settings`);
  check("settings lists the device", (await page.getByText(/Android phone|Windows PC/).count()) > 0);
  await ctx.close();

  // A passkey that isn't on file is refused.
  const other = await phone();
  const p2 = waitFresh(await other.newPage());
  const cdp2 = await other.newCDPSession(p2);
  await cdp2.send("WebAuthn.enable");
  await cdp2.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await p2.goto(`${base}/login`);
  await p2.getByRole("button", { name: /Sign in with fingerprint or face/ }).click();
  await p2.waitForTimeout(2500);
  check("unknown phone stays signed out", new URL(p2.url()).pathname.startsWith("/login"));
  await other.close();
}

// ── Forgot password ──
{
  const email = creds.client.email;
  await fetch(`${mailpit}/api/v1/messages`, { method: "DELETE" });
  const ctx = await phone();
  const page = waitFresh(await ctx.newPage());
  page.on("pageerror", (e) => check("no page errors (reset)", false, e.message.slice(0, 120)));
  await page.goto(`${base}/login`);
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await page.locator('input[type="email"]').fill(email);
  await page.getByRole("button", { name: "Email me a reset link" }).click();
  await page.getByText(/reset link is on its way/).waitFor({ timeout: 15000 });
  check("reset request confirms without revealing accounts", true);
  let link = null;
  for (let i = 0; i < 20 && !link; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const list = await fetch(`${mailpit}/api/v1/messages`).then((r) => r.json());
    const msg = list.messages?.find((m) => m.To?.some((t) => t.Address === email));
    if (msg) {
      const full = await fetch(`${mailpit}/api/v1/message/${msg.ID}`).then((r) => r.json());
      link = (full.HTML || full.Text || "").match(/href="([^"]+)"/)?.[1]?.replaceAll("&amp;", "&") ?? null;
    }
  }
  check("reset email arrives with a link", Boolean(link));
  await page.goto(link);
  await page.waitForURL(/\/reset-password/, { timeout: 15000 });
  check("reset link opens the new-password screen", page.url().includes("/reset-password"), page.url());
  const fresh = `${creds.client.password}-New2`;
  await page.locator('input[autocomplete="new-password"]').nth(0).fill(fresh);
  await page.locator('input[autocomplete="new-password"]').nth(1).fill(fresh);
  await page.getByRole("button", { name: "Save new password" }).click();
  await page.getByText("Password changed").waitFor({ timeout: 10000 });
  await page.waitForURL((u) => !u.pathname.startsWith("/reset-password"), { timeout: 10000 });
  check("new password saved, then into the app", true);
  const anon = createClient(creds.url, process.env.LOCAL_SUPABASE_PUBLISHABLE, { auth: { persistSession: false } });
  const { error } = await anon.auth.signInWithPassword({ email, password: fresh });
  check("new password works", !error, error?.message);
  // Put the audit password back.
  const { data: users } = await db.auth.admin.listUsers();
  await db.auth.admin.updateUserById(users.users.find((u) => u.email === email).id, { password: creds.client.password });
  await ctx.close();
}

// ── Calendar post sheet ──
{
  const ctx = await phone();
  const page = waitFresh(await ctx.newPage());
  page.on("pageerror", (e) => check("no page errors (calendar)", false, e.message.slice(0, 120)));
  await page.goto(`${base}/login`);
  await page.locator('input[type="email"]').fill(creds.owner.email);
  await page.locator('input[type="password"]').fill(creds.owner.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  // Phones with a fingerprint get a one-time "Faster sign-in" offer; skip it here.
  await Promise.race([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }),
    page.getByRole("button", { name: "Not now" }).click({ timeout: 30000 }).catch(() => {}),
  ]);
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));

  // A fresh open post three days out, so it is visible and movable.
  const { data: post } = await db.from("content_posts").select("id, job_id, workspace_id").eq("workspace_id", creds.workspace).limit(1).single();
  // An unusual minute makes this post's row unique on the calendar.
  const at = new Date(Date.now() + 3 * 86400e3);
  at.setUTCHours(15, 17, 0, 0);
  const { data: wsRow } = await db.from("content_workspaces").select("timezone").eq("id", creds.workspace).single();
  const shown = () => new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: wsRow.timezone });
  await db.from("content_posts").update({ status: "awaiting_approval", buffer_post_id: null, scheduled_at: at.toISOString() }).eq("id", post.id);
  const day = at.toISOString().slice(0, 10);
  await page.goto(`${base}/calendar?view=list&d=${day}&ws=${creds.workspace}`);
  check("approve-all bar shows waiting posts", (await page.getByRole("button", { name: "Approve all" }).count()) === 1);
  const { data: jobRow } = await db.from("content_jobs").select("title").eq("id", post.job_id).single();
  await page.getByRole("button", { name: new RegExp(`${jobRow.title}.*${shown()}`) }).first().click();
  const sheet = page.getByRole("dialog");
  await sheet.waitFor();
  check("tapping a post opens its sheet", (await sheet.getByRole("button", { name: "Next free slot" }).count()) === 1);
  const before = (await db.from("content_posts").select("scheduled_at").eq("id", post.id).single()).data.scheduled_at;
  await sheet.getByRole("button", { name: "1 hour later" }).click();
  await sheet.getByText(/Moved to/).waitFor({ timeout: 10000 });
  const after = (await db.from("content_posts").select("scheduled_at").eq("id", post.id).single()).data.scheduled_at;
  check("1 hour later moves the post by 60 minutes", new Date(after) - new Date(before) === 3600e3, `${before} → ${after}`);
  await page.waitForTimeout(1800);
  check("sheet closes itself after a move", (await page.getByRole("dialog").count()) === 0);
  await page.getByRole("button", { name: new RegExp(`${jobRow.title}.*${new Date(new Date(at).getTime() + 3600e3).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: wsRow.timezone })}`) }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Next free slot" }).click();
  await page.getByRole("dialog").getByText(/Moved to|No free slot/).waitFor({ timeout: 10000 });
  check("next free slot picks a time", (await page.getByRole("dialog").getByText(/Moved to/).count()) === 1);
  await page.waitForTimeout(1800);
  const slotAt = (await db.from("content_posts").select("scheduled_at").eq("id", post.id).single()).data.scheduled_at;
  const slotDay = new Date(slotAt).toLocaleDateString("en-CA", { timeZone: wsRow.timezone });
  await page.goto(`${base}/calendar?view=list&d=${slotDay}&ws=${creds.workspace}`);
  await page.getByRole("button", { name: new RegExp(`${jobRow.title}.*${new Date(slotAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: wsRow.timezone })}`) }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Approve & schedule" }).click();
  await page.getByRole("dialog").locator('[role="alert"], [role="status"]').first().waitFor({ timeout: 15000 });
  const msg = await page.getByRole("dialog").locator('[role="alert"], [role="status"]').first().innerText();
  check("approve explains the outcome", msg.length > 5, msg.slice(0, 90));
  await page.keyboard.press("Escape");
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
