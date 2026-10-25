#!/usr/bin/env node
// Stamps public/sw.js with a fresh build id before each deploy. Browsers re-check /sw.js on every
// app open; a changed file installs the new worker, which drops screens and code stored by the old
// one. This works even when an old copy of the app is the one running (it doesn't need new page code).
import fs from "node:fs";
const file = new URL("../public/sw.js", import.meta.url);
const id = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const src = fs.readFileSync(file, "utf8");
const next = src.replace(/^const BUILD = "[^"]*";/m, `const BUILD = "${id}";`);
if (next === src && !/^const BUILD = /m.test(src)) throw new Error("sw.js has no BUILD line");
fs.writeFileSync(file, next);
console.log(`sw.js build ${id}`);
