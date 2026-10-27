#!/usr/bin/env node
// Capture a website the speaker mentioned, ready to drop into an edit.
//   node scripts/capture-site.mjs <url-or-domain> <out-folder> [--name "Brand"]
// Writes: page.png (1920x1080 first screen), page-mobile.png (1080x1920 phone view), full.png (whole page,
// max 6000px), logo.png (site icon / logo when found), info.json (title, description, url, colors).
// Uses the Playwright + Chromium installed with this kit (npm install). Cookie banners are dismissed when possible.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const [, , target, outDir] = process.argv;
if (!target || !outDir) {
  console.error('usage: node scripts/capture-site.mjs <url-or-domain> <out-folder>');
  process.exit(1);
}
const url = /^https?:\/\//i.test(target) ? target : `https://${target.replace(/^www\./i, "www.")}`;
fs.mkdirSync(outDir, { recursive: true });

// Use whichever Chromium build is installed (Playwright's expected one may not be downloaded).
const pw = path.join(process.env.LOCALAPPDATA || "", "ms-playwright");
const shell = fs.existsSync(pw)
  ? fs.readdirSync(pw).filter((d) => d.startsWith("chromium_headless_shell-")).sort().reverse()
      .map((d) => path.join(pw, d, "chrome-headless-shell-win64", "chrome-headless-shell.exe")).find((f) => fs.existsSync(f))
  : undefined;
const browser = await chromium.launch(shell ? { executablePath: shell } : {});
const dismiss = async (page) => {
  // Only real cookie / consent buttons (exact labels), so nothing else on the page gets clicked.
  for (const label of [/^accept( all)?( cookies)?$/i, /^(i )?agree$/i, /^got it$/i, /^allow all( cookies)?$/i, /^reject( all)?$/i]) {
    const b = page.getByRole("button", { name: label }).first();
    if (await b.isVisible({ timeout: 300 }).catch(() => false)) {
      await b.click({ timeout: 1000 }).catch(() => {});
      await page.waitForTimeout(400);
      return;
    }
  }
};

try {
  const desk = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await desk.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await desk.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  // Some sites show an anti-bot interstitial to automated browsers. Give it a moment; never try to get around it.
  for (let i = 0; i < 8 && /just a moment|attention required|verify you are human/i.test(await desk.title()); i++) await desk.waitForTimeout(1000);
  if (/just a moment|attention required|verify you are human/i.test(await desk.title())) {
    fs.writeFileSync(path.join(outDir, "info.json"), JSON.stringify({ url, blocked: true, note: "The site shows a bot check to automated browsers. Use a clean title/logo card with the exact name instead." }, null, 2));
    console.log(`Blocked by the site's bot check: ${url}. Use a title/logo card instead.`);
    await browser.close();
    process.exit(0);
  }
  await dismiss(desk);
  await desk.waitForTimeout(800);
  await desk.screenshot({ path: path.join(outDir, "page.png") });
  const height = await desk.evaluate(() => Math.min(document.body.scrollHeight, 6000));
  await desk.setViewportSize({ width: 1920, height: Math.max(1080, height) });
  await desk.screenshot({ path: path.join(outDir, "full.png"), fullPage: false });

  const info = await desk.evaluate(() => {
    const meta = (n) => document.querySelector(`meta[name="${n}"], meta[property="${n}"]`)?.getAttribute("content") || null;
    const icons = [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')].map((l) => ({ href: l.href, sizes: l.getAttribute("sizes") || "" }));
    const logoImg = [...document.images].find((i) => /logo/i.test(i.alt + i.className + i.src) && i.naturalWidth >= 64);
    return {
      title: document.title,
      siteName: meta("og:site_name"),
      description: meta("description") || meta("og:description"),
      ogImage: meta("og:image"),
      themeColor: meta("theme-color"),
      logo: logoImg?.src || null,
      icons,
      url: location.href,
    };
  });
  // Best logo: an <img> marked as logo, else the biggest icon, else og:image.
  const iconBySize = info.icons.sort((a, b) => (parseInt(b.sizes) || 0) - (parseInt(a.sizes) || 0))[0]?.href;
  const logoUrl = info.logo || iconBySize || info.ogImage;
  if (logoUrl) {
    const res = await desk.request.get(logoUrl).catch(() => null);
    if (res?.ok()) fs.writeFileSync(path.join(outDir, `logo${path.extname(new URL(logoUrl).pathname).slice(0, 5) || ".png"}`), await res.body());
  }

  const phone = await browser.newPage({ viewport: { width: 390, height: 693 }, deviceScaleFactor: 2.77, isMobile: true, hasTouch: true });
  await phone.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await phone.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await dismiss(phone);
  await phone.waitForTimeout(600);
  await phone.screenshot({ path: path.join(outDir, "page-mobile.png") });

  fs.writeFileSync(path.join(outDir, "info.json"), JSON.stringify(info, null, 2));
  console.log(`Captured ${info.url}: ${info.siteName || info.title}\n -> ${outDir}`);
} catch (e) {
  console.error(`Could not capture ${url}: ${e.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
