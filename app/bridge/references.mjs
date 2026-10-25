// Downloads a reference link (Instagram reel, TikTok, YouTube, X…) with yt-dlp so the editor can
// watch it frame by frame instead of guessing from the URL. Public posts only; private ones fail
// quietly and the editor gets the link instead.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export function downloadReference(url, dir, baseName) {
  if (!/^https?:\/\//i.test(url)) return null;
  fs.mkdirSync(dir, { recursive: true });
  const existing = fs.readdirSync(dir).find((f) => f.startsWith(`${baseName}.`) && /\.(mp4|mov|webm|mkv)$/i.test(f));
  if (existing) return path.join(dir, existing);
  const r = spawnSync(
    "yt-dlp",
    ["--no-playlist", "--no-warnings", "--quiet", "--max-filesize", "300M", "-f", "mp4/bestvideo*+bestaudio/best", "--merge-output-format", "mp4", "-o", path.join(dir, `${baseName}.%(ext)s`), url],
    { encoding: "utf8", timeout: 180000, windowsHide: true },
  );
  if (r.status !== 0) return null;
  const file = fs.readdirSync(dir).find((f) => f.startsWith(`${baseName}.`) && /\.(mp4|mov|webm|mkv)$/i.test(f));
  return file ? path.join(dir, file) : null;
}
