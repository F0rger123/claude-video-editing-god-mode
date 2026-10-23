#!/usr/bin/env node
// LOCAL self-audit for instant open + the ideas screen. Needs a PRODUCTION build (`next build && next start`)
// on :3107 against local Supabase, because the service worker only runs in production.
//   node scripts/audit-speed.mjs
import fs from "node:fs";
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const base = "http://localhost:3107";
const creds = JSON.parse(fs.readFileSync("supabase/.audit-users.json", "utf8"));
if (!/127\.0\.0\.1|localhost/.test(creds.url)) throw new Error("Local only.");
const db = createClient(creds.url, process.env.LOCAL_SUPABASE_SECRET, { auth: { persistSession: false } });
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});

async function signIn(ctx, who) {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => check(`no page errors (${who})`, false, e.message.slice(0, 120)));
  await page.goto(`${base}/login`);
  await page.locator('input[type="email"]').fill(creds[who].email);
  await page.locator('input[type="password"]').fill(creds[who].password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await Promise.race([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }),
    page.getByRole("button", { name: "Not now" }).click({ timeout: 30000 }).catch(() => {}),
  ]);
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  return page;
}

// Fresh ideas for the audit client so the deck has cards.
await db.from("content_script_ideas").insert(
  Array.from({ length: 6 }, (_, i) => ({ workspace_id: creds.workspace, hook: `Speed audit idea ${i + 1}: the one mistake that costs homeowners thousands`, why: "Short reason it works.", script: "Line one.\nLine two.\nLine three.", form: i % 2 ? "long" : "short", status: "new" })),
);

// ── Instant open (service worker) ──
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await signIn(ctx, "owner");
  await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 15000 }).catch(() => {});
  check("service worker controls the app", await page.evaluate(() => Boolean(navigator.serviceWorker?.controller)));
  await page.goto(`${base}/`, { waitUntil: "networkidle" }); // stores a copy
  await page.waitForTimeout(800);
  const t0 = Date.now();
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  const ms = Date.now() - t0;
  const cached = await page.evaluate(() => Boolean(document.querySelector('meta[name="azc-cached"]')));
  check("reopening Today is served from the phone's copy", cached, `${ms} ms`);
  await page.waitForLoadState("networkidle");
  check("live data loads after the instant copy", (await page.locator("h1").count()) > 0);

  // Signing out must wipe the stored screens.
  await ctx.clearCookies();
  await page.evaluate(() => navigator.serviceWorker.controller.postMessage("clear"));
  await page.waitForTimeout(500);
  const left = await page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith("azve-pages")).length);
  check("sign-out clears stored screens", left === 0, `${left} left`);
  await page.goto(`${base}/`);
  check("signed out goes to login, not a stored copy", new URL(page.url()).pathname === "/login", page.url());
  await ctx.close();
}

// ── Ideas: tabs, list mode, fits on screen ──
for (const who of ["owner", "client"]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await signIn(ctx, who);
  const url = who === "owner" ? `${base}/scripts?ws=${creds.workspace}` : `${base}/portal/audit-client/scripts`;
  await page.goto(url, { waitUntil: "networkidle" });
  const like = page.getByRole("button", { name: "Like", exact: true });
  const box = await like.boundingBox();
  check(`${who}: swipe buttons fit on the first screen`, Boolean(box) && box.y + box.height <= 844 - 76, box ? `bottom at ${Math.round(box.y + box.height)}px` : "no button");
  await page.screenshot({ path: `.audit/ideas-${who}.png` });
  check(`${who}: Approved and Passed tabs`, (await page.getByRole("tab", { name: /Approved/ }).count()) === 1 && (await page.getByRole("tab", { name: /Passed/ }).count()) === 1);
  await page.getByRole("button", { name: "Show as a list" }).click();
  const cards = await page.getByRole("button", { name: /^Like: / }).count();
  check(`${who}: list mode shows every new idea to scroll`, cards >= 5, `${cards} ideas`);
  await page.screenshot({ path: `.audit/ideas-${who}-list.png`, fullPage: true });
  const first = page.getByRole("button", { name: /^Like: / }).first();
  const hook = (await first.getAttribute("aria-label")).replace(/^Like: /, "");
  await first.click();
  await page.waitForTimeout(1200);
  await page.getByRole("tab", { name: /Approved/ }).click();
  check(`${who}: liked idea appears in Approved`, (await page.getByText(hook).count()) > 0);
  await page.getByRole("tab", { name: /New/ }).click();
  await page.getByRole("button", { name: "Show as cards to swipe" }).click();
  await ctx.close();
}

await db.from("content_script_ideas").delete().like("hook", "Speed audit idea%");
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
