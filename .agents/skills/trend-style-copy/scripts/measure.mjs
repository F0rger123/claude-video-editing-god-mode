#!/usr/bin/env node
// Measure a video's editing style so another edit can match it (or check that it did).
//   node measure.mjs <video> <out-folder> [--url <reference link>]
// Writes <out-folder>/style.json and contact.jpg (1 frame per second, 6 across).
// Measures: duration, aspect, cut times (scene changes), cuts per 10 s, median / shortest / longest shot,
// how fast the first cut lands, loudness (LUFS), and silence share. Needs ffmpeg + ffprobe on PATH.
// With --url and no local file yet, downloads the reference first with yt-dlp (public videos only).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const urlAt = args.indexOf("--url");
const url = urlAt >= 0 ? args[urlAt + 1] : null;
let [video, outDir] = args.filter((a, i) => !a.startsWith("--") && (urlAt < 0 || i !== urlAt + 1));
if (!outDir) {
  console.error("usage: node measure.mjs <video|-> <out-folder> [--url <link>]");
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
const run = (cmd, a) => spawnSync(cmd, a, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

if ((!video || video === "-" || !fs.existsSync(video)) && url) {
  const tmpl = path.join(outDir, "reference.%(ext)s");
  const r = run("yt-dlp", ["-f", "mp4/bestvideo*+bestaudio/best", "--merge-output-format", "mp4", "-o", tmpl, "--no-playlist", url]);
  video = fs.readdirSync(outDir).map((f) => path.join(outDir, f)).find((f) => /reference\.(mp4|mkv|webm|mov)$/.test(f));
  if (!video) {
    fs.writeFileSync(path.join(outDir, "style.json"), JSON.stringify({ url, downloaded: false, note: "Could not download (private, removed or blocked). Use the written edit style instead.", log: (r.stderr || "").slice(-500) }, null, 2));
    console.log("Reference could not be downloaded; wrote style.json with downloaded:false");
    process.exit(0);
  }
}

const probe = JSON.parse(run("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=width,height,codec_type", "-of", "json", video]).stdout || "{}");
const duration = Number(probe.format?.duration) || 0;
const v = (probe.streams || []).find((s) => s.codec_type === "video") || {};

// Scene changes = cuts. 0.30 catches hard cuts; zoom punches rarely cross it.
const scenes = run("ffmpeg", ["-hide_banner", "-i", video, "-vf", "select='gt(scene,0.30)',showinfo", "-an", "-f", "null", "-"]).stderr;
const cuts = [...scenes.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1])).filter((t) => t > 0.2);
const bounds = [0, ...cuts, duration];
const shots = bounds.slice(1).map((t, i) => t - bounds[i]).filter((d) => d > 0.05).sort((a, b) => a - b);
const median = shots.length ? shots[Math.floor(shots.length / 2)] : duration;

const loud = run("ffmpeg", ["-hide_banner", "-i", video, "-af", "ebur128=peak=true", "-f", "null", "-"]).stderr;
const lufs = Number(loud.match(/I:\s+(-?[\d.]+) LUFS/g)?.pop()?.match(/-?[\d.]+/)?.[0]);
const sil = run("ffmpeg", ["-hide_banner", "-i", video, "-af", "silencedetect=n=-35dB:d=0.4", "-f", "null", "-"]).stderr;
const silent = [...sil.matchAll(/silence_duration: ([\d.]+)/g)].reduce((a, m) => a + Number(m[1]), 0);

run("ffmpeg", ["-hide_banner", "-y", "-i", video, "-vf", "fps=1,scale=240:-1,tile=6x" + Math.max(1, Math.ceil(Math.min(duration, 90) / 6)), "-frames:v", "1", "-t", "90", path.join(outDir, "contact.jpg")]);

const style = {
  source: url || path.basename(video),
  downloaded: true,
  file: video,
  duration_s: Math.round(duration * 10) / 10,
  aspect: v.width && v.height ? `${v.width}x${v.height}${v.height > v.width ? " (vertical)" : ""}` : null,
  cuts: cuts.length,
  cuts_per_10s: duration ? Math.round((cuts.length / duration) * 100) / 10 : 0,
  median_shot_s: Math.round(median * 100) / 100,
  shortest_shot_s: shots.length ? Math.round(shots[0] * 100) / 100 : null,
  longest_shot_s: shots.length ? Math.round(shots[shots.length - 1] * 100) / 100 : null,
  first_cut_s: cuts.length ? Math.round(cuts[0] * 100) / 100 : null,
  cut_times_s: cuts.map((t) => Math.round(t * 100) / 100),
  loudness_lufs: Number.isFinite(lufs) ? lufs : null,
  silence_share: duration ? Math.round((silent / duration) * 100) / 100 : null,
  contact_sheet: path.join(outDir, "contact.jpg"),
  look_for_in_contact_sheet: ["caption font / size / color / position / words per screen", "text hooks in the first second", "zoom punches and their rhythm", "B-roll / screen inserts share", "transitions", "color grade", "face framing"],
};
fs.writeFileSync(path.join(outDir, "style.json"), JSON.stringify(style, null, 2));
console.log(`${style.duration_s}s · ${style.cuts} cuts (${style.cuts_per_10s}/10s) · median shot ${style.median_shot_s}s · ${style.loudness_lufs ?? "?"} LUFS → ${outDir}`);
