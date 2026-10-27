#!/usr/bin/env node
// Bundle Paper Shaders (+ Paper's own React param->uniform mapping, React shimmed out)
// and the hf-paper seek driver into ONE local file: templates/vendor/hf-paper.js (IIFE, no CDN).
// Also writes templates/vendor/paper-shaders.json (shader names + preset params).
//   cd tools/paper && npm install && node build-vendor.mjs      (only after changing src/ or upgrading Paper)
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(ROOT, "../../templates/vendor");
const shim = path.join(ROOT, "src/react-shim.js");
const alias = { react: shim, "react/jsx-runtime": shim };
const pkg = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, "node_modules", n, "package.json"), "utf8")).version;
const banner = `/*! hf-paper ${new Date().toISOString().slice(0, 10)}: Paper Shaders @paper-design/shaders ${pkg("@paper-design/shaders")} + @paper-design/shaders-react ${pkg("@paper-design/shaders-react")} (Apache-2.0, https://github.com/paper-design/shaders), bundled with React shimmed out, plus the ghost-editor HyperFrames seek driver. See THIRD_PARTY.md. */`;

fs.mkdirSync(OUT, { recursive: true });
await build({
  entryPoints: [path.join(ROOT, "src/hf-paper.js")],
  bundle: true, format: "iife", minify: true, target: "chrome110", platform: "browser",
  alias, banner: { js: banner }, outfile: path.join(OUT, "hf-paper.js"), logLevel: "warning",
  legalComments: "inline",
});

// preset table, built for node from the same sources
const tmp = path.join(OUT, ".presets.mjs");
fs.writeFileSync(path.join(ROOT, "src/.presets-entry.js"), `export * from "@paper-design/shaders-react";\n`);
await build({ entryPoints: [path.join(ROOT, "src/.presets-entry.js")], bundle: true, format: "esm", platform: "node", alias, outfile: tmp, logLevel: "warning" });
const R = await import(pathToFileURL(tmp).href);
const table = {};
for (const [name, val] of Object.entries(R)) {
  if (val && val.$$paper) {
    const kebab = name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
    const presets = R[name[0].toLowerCase() + name.slice(1) + "Presets"] || [];
    table[kebab] = { component: name, presets: Object.fromEntries(presets.map((p) => [p.name, p.params])) };
  }
}
fs.writeFileSync(path.join(OUT, "paper-shaders.json"), JSON.stringify(table, null, 1));
fs.rmSync(tmp); fs.rmSync(path.join(ROOT, "src/.presets-entry.js"));

// Paper's Apache-2.0 LICENSE and NOTICE travel with the bundle
for (const f of ["LICENSE", "NOTICE"]) fs.copyFileSync(path.join(ROOT, "node_modules/@paper-design/shaders", f), path.join(OUT, `${f}-paper-shaders.txt`));
const kb = (f) => (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0) + " KB";
console.log(`templates/vendor/hf-paper.js ${kb("hf-paper.js")}, ${Object.keys(table).length} shaders`);
