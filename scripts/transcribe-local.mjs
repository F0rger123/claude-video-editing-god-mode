#!/usr/bin/env node
// Transcribe a video/audio file locally with whisper.cpp -> word-level JSON in the
// same shape the cutting tools expect from transcribe-elevenlabs.mjs. Free, no API key.
//
// Usage:
//   node scripts/transcribe-local.mjs <input> [options]
//
// Defaults:
//   --output   <input-without-ext>.json next to the source
//   --model    medium.en (GPU build makes this fast; use medium / large-v3 without .en for non-English audio)
//   --language en
//
// whisper-cli is found through HYPERFRAMES_WHISPER_PATH (env or workspace .env), then PATH.
// Models download once to ~/.cache/hyperframes/whisper/models.

import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join, resolve, basename, extname } from "node:path";
import { spawnSync } from "node:child_process";
import { argv, exit, env } from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = resolve(SCRIPT_DIR, "..");

function die(msg, code = 1) {
  console.error(msg);
  exit(code);
}

// --- parse args ---
const args = argv.slice(2);
if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  console.log(
    `Usage: node scripts/transcribe-local.mjs <input> [--output path] ` +
      `[--model tiny.en|base.en|small.en|medium.en|large-v3|small|medium] [--language en]`,
  );
  exit(args.length === 0 ? 1 : 0);
}

const opts = { input: null, output: null, model: "medium.en", language: "en" };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--output" || a === "-o") opts.output = args[++i];
  else if (a === "--model") opts.model = args[++i];
  else if (a === "--language" || a === "--lang") opts.language = args[++i];
  else if (a.startsWith("--")) die(`unknown option: ${a}`);
  else if (!opts.input) opts.input = a;
  else die(`unexpected argument: ${a}`);
}
if (!opts.input) die("no input file given");
if (opts.model.endsWith(".en") && opts.language && opts.language !== "en") {
  die(`${opts.model} only handles English. Use --model ${opts.model.replace(/\.en$/, "")} for --language ${opts.language}.`);
}

const inputPath = resolve(opts.input);
if (!existsSync(inputPath)) die(`input not found: ${inputPath}`);
const inputStem = basename(inputPath, extname(inputPath));
const outputPath = resolve(opts.output ?? join(dirname(inputPath), `${inputStem}.json`));

// --- whisper-cli location (env first, then workspace .env) ---
let whisperPath = env.HYPERFRAMES_WHISPER_PATH;
if (!whisperPath) {
  const dotenv = join(WORKSPACE_ROOT, ".env");
  if (existsSync(dotenv)) {
    const m = readFileSync(dotenv, "utf8").match(/^\s*HYPERFRAMES_WHISPER_PATH\s*=\s*(.+?)\s*$/m);
    if (m) whisperPath = m[1].replace(/^["']|["']$/g, "");
  }
}
const childEnv = { ...env };
if (whisperPath) childEnv.HYPERFRAMES_WHISPER_PATH = whisperPath;

// --- run hyperframes transcribe in a scratch dir (it handles audio extraction and model download) ---
const work = mkdtempSync(join(WORKSPACE_ROOT, "tmp-transcribe-"));
const t0 = Date.now();
// Call the local CLI through node directly, so paths with spaces need no shell quoting.
const hfCli = join(WORKSPACE_ROOT, "node_modules", "hyperframes", "bin", "hyperframes.mjs");
if (!existsSync(hfCli)) die("hyperframes is not installed. Run npm ci first.");
const hfArgs = [hfCli, "transcribe", inputPath, "--dir", work, "--model", opts.model];
if (opts.language) hfArgs.push("--language", opts.language);
console.log(`transcribing ${basename(inputPath)} locally with ${opts.model} ...`);
const run = spawnSync(process.execPath, hfArgs, { cwd: WORKSPACE_ROOT, env: childEnv, stdio: ["ignore", "ignore", "pipe"] });
const transcriptPath = join(work, "transcript.json");
if (run.status !== 0 || !existsSync(transcriptPath)) {
  rmSync(work, { recursive: true, force: true });
  die(`hyperframes transcribe failed:\n${run.stderr?.toString().slice(-1500) ?? ""}`, run.status || 1);
}
const raw = JSON.parse(readFileSync(transcriptPath, "utf8"));
rmSync(work, { recursive: true, force: true });

// --- normalize to the kit's common format ---
const list = Array.isArray(raw) ? raw : raw.words ?? [];
const words = list
  .map((w) => ({ text: String(w.text ?? w.word ?? "").trim(), start: Number(w.start), end: Number(w.end), type: "word" }))
  .filter((w) => w.text && Number.isFinite(w.start) && Number.isFinite(w.end));

const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", inputPath], { encoding: "utf8" });
const duration = Number(probe.stdout.trim());

const json = {
  language_code: opts.language || null,
  audio_duration_secs: Number.isFinite(duration) ? duration : null,
  text: words.map((w) => w.text).join(" "),
  words,
  source: { engine: "whisper.cpp", model: opts.model },
};
writeFileSync(outputPath, JSON.stringify(json, null, 2));

const dt = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`ok ${dt}s | ${words.length} words | ${json.audio_duration_secs?.toFixed?.(1) ?? "?"}s audio | ${outputPath}`);
