#!/usr/bin/env node
// Renders a local HTML file to PNG with the Chromium that ships with herk-edit-kit (design previews,
// icon rasterising).   node scripts/render-html.mjs <in.html> <out.png> [width] [height] [scale] [transparent]
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const [input, output, w = "800", h = "600", scale = "1", transparent] = process.argv.slice(2);
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: Number(scale) });
await page.goto(pathToFileURL(path.resolve(input)).href);
await page.screenshot({ path: output, omitBackground: transparent === "transparent" });
await browser.close();
