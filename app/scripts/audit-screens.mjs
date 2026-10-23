#!/usr/bin/env node
// LOCAL self-audit: signs in as the local test owner and client (scripts/audit-setup.mjs), opens every
// screen at phone size, and reports errors, horizontal overflow and slow pages. Screenshots go to
// .audit/ (git-ignored). Uses the Playwright that ships with herk-edit-kit, so nothing is installed.
//   node scripts/audit-screens.mjs [baseUrl]
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const base = process.argv[2] || "http://localhost:3107";
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(base)) throw new Error("Local only.");
const creds = JSON.parse(fs.readFileSync("supabase/.audit-users.json", "utf8"));
const out = path.resolve(".audit");
fs.mkdirSync(out, { recursive: true });

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
const report = [];

async function session(who, pages) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });
  const page = waitFresh(await ctx.newPage());
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));
  await page.goto(`${base}/login`);
  
  await page.locator('input[type="email"]').fill(creds[who].email);
  await page.locator('input[type="password"]').fill(creds[who].password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await Promise.race([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }),
    page.getByRole("button", { name: "Not now" }).click({ timeout: 20000 }).catch(() => {}),
  ]);
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
  for (const p of pages) {
    errors.length = 0;
    const t0 = Date.now();
    const res = await page.goto(`${base}${p}`, { waitUntil: "load", timeout: 30000 }).catch((e) => ({ status: () => `ERR ${e.message.slice(0, 80)}` }));
    const ms = Date.now() - t0;
    const overflow = await page.evaluate(() => {
      const w = document.documentElement.clientWidth;
      const bad = [];
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.width && r.right > w + 1 && getComputedStyle(el).position !== "fixed") bad.push(`${el.tagName}.${String(el.className).slice(0, 50)} r=${Math.round(r.right)}`);
      }
      return { scroll: document.documentElement.scrollWidth > w, bad: bad.slice(0, 3) };
    });
    const h1 = await page.locator("h1").first().textContent().catch(() => "");
    const name = `${who}${p.replace(/[/?=&]+/g, "_") || "_home"}`.slice(0, 80);
    await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
    report.push({ who, page: p, status: res?.status?.(), ms, h1: (h1 || "").trim().slice(0, 50), overflow: overflow.scroll ? overflow.bad : null, errors: [...errors] });
  }
  await ctx.close();
}

const ws = creds.workspace;
await session("owner", ["/", "/inbox", "/upload", "/calendar", "/calendar?view=month", "/calendar?view=list", "/clients", "/clients/new", `/clients/${ws}`, `/clients/${ws}?tab=portal`, `/clients/${ws}?tab=channels`, `/clients/${ws}?tab=styles`, `/clients/${ws}?tab=settings`, "/jobs", "/scripts", `/scripts?ws=${ws}`, "/library", "/notifications", "/settings", "/guide", "/install", "/portal/audit-client"]);
await session("client", ["/", "/portal/audit-client", "/portal/audit-client/upload", "/portal/audit-client/scripts", "/portal/audit-client/calendar", "/inbox", "/portal/studio-hq"]);
await browser.close();
fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
for (const r of report) {
  const flags = [r.status !== 200 ? `status ${r.status}` : "", r.overflow ? `OVERFLOW ${r.overflow.join(" | ")}` : "", r.errors.length ? `ERRORS ${r.errors.join(" | ")}` : "", r.ms > 4000 ? `slow ${r.ms}ms` : ""].filter(Boolean).join("  ");
  console.log(`${r.who.padEnd(6)} ${r.page.padEnd(52)} ${String(r.ms).padStart(5)}ms  "${r.h1}"  ${flags}`);
}
