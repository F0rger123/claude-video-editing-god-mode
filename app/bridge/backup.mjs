// Google Drive backup of the editor folder (HERK_DRIVE_ROOT → "My Drive\God Mode Cut backup").
//
// Copy only: new and changed files are copied, nothing is ever deleted from the backup, so a
// mistake on the PC can't wipe the copy in Drive. Runs as a detached robocopy so a first big copy
// (gigabytes of video) never blocks the bridge; each pass reads the last result from its log.
// If Google Drive for desktop isn't running, the bridge starts it and tries again next pass.
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

export const BACKUP_FOLDER = process.env.BACKUP_FOLDER || "God Mode Cut backup";
const DRIVE_EXE = String.raw`C:\Program Files\Google\Drive File Stream\launch.bat`;
// Never worth copying: half-written downloads, temp files, Windows/Office clutter, editor scratch.
export const EXCLUDE_FILES = ["*.part", "*.tmp", "*.crdownload", "desktop.ini", "Thumbs.db", "~$*", ".~lock*"];
export const EXCLUDE_DIRS = ["tmp", ".tmp", "node_modules", "$RECYCLE.BIN"];

/** "My Drive" of Google Drive for desktop: whichever letter it mounted on (usually G:). */
export function findMyDrive(exists = fs.existsSync) {
  for (const letter of "GHIJKLMNOPQRSTUVWXYZDEF") {
    const p = `${letter}:\\My Drive`;
    if (exists(p)) return p;
  }
  return null;
}

export function robocopyArgs(source, dest, logFile) {
  return [source, dest, "/E", "/FFT", "/XJ", "/R:2", "/W:5", "/MT:4", "/NP", "/NDL", "/NFL", "/BYTES", `/LOG:${logFile}`, "/XF", ...EXCLUDE_FILES, "/XD", ...EXCLUDE_DIRS];
}

/** Robocopy: 0–7 = success (bit flags for copied / extra / mismatched), 8+ = some files failed. */
export function robocopyOk(code) {
  return Number.isInteger(code) && code >= 0 && code < 8;
}

/** Pulls the totals out of robocopy's summary ("Files : total copied skipped mismatch FAILED extras"). */
export function parseRobocopySummary(text) {
  const row = (label) => {
    const m = text.match(new RegExp(`^\\s*${label}\\s*:\\s*([\\d\\s]+)$`, "m"));
    if (!m) return null;
    const n = m[1].trim().split(/\s+/).map(Number);
    return { total: n[0], copied: n[1], skipped: n[2], failed: n[4] };
  };
  return { files: row("Files"), bytes: row("Bytes") };
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/**
 * One bridge pass: report on the last copy, and start the next one if none is running.
 * Returns the status shown in the app (Settings → Editor).
 */
export function backupPass({ root, stateDir, log = () => {}, dry = false, minutesBetween = 30, myDrive: driveOverride = null }) {
  const statusFile = path.join(stateDir, "backup.json");
  const logFile = path.join(stateDir, "backup.log");
  const prev = readJson(statusFile) || {};
  const now = Date.now();

  // A copy is still running: report progress, don't start another.
  if (prev.pid && alive(prev.pid)) return { ...prev.report, status: "copying", started_at: prev.started_at };

  // The copy that just finished: record how it went.
  let report = prev.report || null;
  if (prev.pid && prev.started_at && !prev.checked) {
    const exitFile = path.join(stateDir, "backup.exit");
    const code = fs.existsSync(exitFile) ? Number(fs.readFileSync(exitFile, "utf8").trim()) : NaN;
    const text = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8") : "";
    const sum = parseRobocopySummary(text);
    const ok = robocopyOk(code);
    report = {
      status: ok ? "ok" : "error",
      dest: prev.dest,
      last_run_at: prev.started_at,
      last_ok_at: ok ? new Date(now).toISOString() : prev.report?.last_ok_at ?? null,
      files: sum.files?.total ?? null,
      copied: sum.files?.copied ?? null,
      failed: sum.files?.failed ?? null,
      bytes: sum.bytes?.total ?? null,
      message: ok ? null : Number.isNaN(code) ? "The last copy stopped before it finished." : `Some files could not be copied (robocopy code ${code}). Details: bridge\\.state\\backup.log`,
    };
    fs.writeFileSync(statusFile, JSON.stringify({ ...prev, checked: true, pid: null, report }, null, 2));
    log(`Drive backup finished: ${report.status}, ${report.copied ?? "?"} copied, ${report.failed ?? "?"} failed`);
  }

  const myDrive = driveOverride ?? findMyDrive();
  if (!myDrive) {
    // Google Drive for desktop not mounted: start it (it's harmless if it is already starting).
    const running = spawnSync("tasklist", ["/FI", "IMAGENAME eq GoogleDriveFS.exe", "/NH"], { encoding: "utf8", windowsHide: true }).stdout?.includes("GoogleDriveFS.exe");
    if (!running && !dry && fs.existsSync(DRIVE_EXE)) {
      spawn("cmd.exe", ["/c", DRIVE_EXE], { detached: true, stdio: "ignore", windowsHide: true }).unref();
      log("Google Drive for desktop was not running: started it.");
    }
    return { ...(report || {}), status: "paused", message: running ? "Google Drive is starting or needs you to sign in (Drive icon in the taskbar)." : "Google Drive for desktop wasn't running. Started it; the backup resumes once it's signed in." };
  }

  const dest = path.join(myDrive, BACKUP_FOLDER);
  const due = !prev.started_at || now - Date.parse(prev.started_at) > minutesBetween * 60000;
  if (!due || dry) return { ...(report || {}), status: report?.status ?? "waiting", dest };

  fs.mkdirSync(stateDir, { recursive: true });
  const exitFile = path.join(stateDir, "backup.exit");
  fs.rmSync(exitFile, { force: true });
  // A small batch file runs the copy and records robocopy's exit code when it ends, even after the
  // bridge has exited (in a batch file %ERRORLEVEL% on its own line is read after robocopy returns;
  // the redirect goes first so "1>" isn't read as "redirect handle 1").
  const args = robocopyArgs(root, dest, logFile).map((a) => (/[\s$~]/.test(a) ? `"${a}"` : a)).join(" ");
  const runner = path.join(stateDir, "backup-run.cmd");
  fs.writeFileSync(runner, ["@echo off", `robocopy ${args}`, `>"${exitFile}" echo %ERRORLEVEL%`, ""].join("\r\n"));
  const child = spawn("cmd.exe", ["/d", "/c", runner], { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
  const started_at = new Date(now).toISOString();
  fs.writeFileSync(statusFile, JSON.stringify({ pid: child.pid, started_at, dest, checked: false, report }, null, 2));
  log(`Drive backup started → ${dest}`);
  return { ...(report || {}), status: "copying", dest, started_at };
}
