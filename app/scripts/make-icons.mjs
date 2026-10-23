#!/usr/bin/env node
// Builds every app icon from one SVG mark (play triangle on a violet-to-ember tile), rasterised by
// Chromium for crisp edges, plus a multi-size favicon.ico.   node scripts/make-icons.mjs
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");

/** tile: "rounded" (transparent corners), "full" (square, for maskable / Apple, which round it themselves). */
function svg({ tile = "rounded", inset = 1 } = {}) {
  const s = 512;
  const k = inset; // shrink the mark for maskable safe zone
  const c = (v) => s / 2 + (v - s / 2) * k;
  const defs = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c3aed"/><stop offset="0.6" stop-color="#c026d3"/><stop offset="1" stop-color="#f97316"/></linearGradient></defs>`;
  const bg = tile === "rounded" ? `<rect width="${s}" height="${s}" rx="112" fill="url(#g)"/>` : `<rect width="${s}" height="${s}" fill="url(#g)"/>`;
  const play = `<path d="M${c(190)} ${c(140)} L${c(380)} ${c(256)} L${c(190)} ${c(372)} Z" fill="#fff" stroke="#fff" stroke-width="${28 * k}" stroke-linejoin="round"/>`;
  const spark = `<path transform="translate(${c(380)} ${c(88)}) scale(${k})" d="M0 0 l14 34 34 14 -34 14 -14 34 -14 -34 -34 -14 34 -14z" fill="#fff" opacity="0.9"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}">${defs}${bg}${play}${spark}</svg>`;
}

const out = [
  ["public/icons/icon-192.png", 192, svg()],
  ["public/icons/icon-512.png", 512, svg()],
  ["public/icons/maskable-512.png", 512, svg({ tile: "full", inset: 0.78 })],
  ["src/app/apple-icon.png", 180, svg({ tile: "full", inset: 0.86 })],
  ["src/app/icon.png", 64, svg()],
  [".audit/fav-16.png", 16, svg()],
  [".audit/fav-32.png", 32, svg()],
  [".audit/fav-48.png", 48, svg()],
];

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const page = await browser.newPage();
for (const [file, size, markup] of out) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${markup.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  fs.mkdirSync(path.dirname(path.join(ROOT, file)), { recursive: true });
  await page.screenshot({ path: path.join(ROOT, file), omitBackground: true });
}
await browser.close();
fs.writeFileSync(path.join(ROOT, "src/app/icon.svg"), svg() + "\n");
// favicon.ico (16/32/48) via Pillow.
execFileSync("python", ["-c", `
from PIL import Image
imgs=[Image.open(r'${path.join(ROOT, ".audit")}'+f'/fav-{n}.png').convert('RGBA') for n in (16,32,48)]
imgs[2].save(r'${path.join(ROOT, "src/app/favicon.ico")}', sizes=[(16,16),(32,32),(48,48)], append_images=imgs[:2])
`]);
console.log("icons written");
