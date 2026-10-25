"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icons";
import { LogoMark } from "@/components/logo";
import { haptic } from "@/lib/haptics";
import { ANDROID_PACKAGE, APP_SHORT_NAME } from "@/lib/brand";

type Release = { versionCode: number; versionName: string; url: string; size?: number; notes?: string[] };
type Phase = "offer" | "downloading" | "ready" | "failed";

const APP_KEY = "gmc-apk-version";
const SNOOZE_KEY = "gmc-apk-snooze";
// Set NEXT_PUBLIC_ANDROID_PACKAGE when you ship your own Android build; without it this never shows.
const PACKAGE = ANDROID_PACKAGE;

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage blocked: the prompt may show again next time
  }
}

/**
 * Which Android app version is this? The APK opens the site at /?src=android&appv=<versionCode>;
 * the very first APK (1.0.0) didn't, but Chrome reports it as the referrer. Remembered per phone.
 */
function installedVersion(): number | null {
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get("src") === "android" ? Number(url.searchParams.get("appv")) : NaN;
  if (Number.isFinite(fromUrl) && fromUrl > 0) {
    write(APP_KEY, String(fromUrl));
    url.searchParams.delete("src");
    url.searchParams.delete("appv");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    return fromUrl;
  }
  if (PACKAGE && document.referrer.startsWith(`android-app://${PACKAGE}`) && !read(APP_KEY)) write(APP_KEY, "1");
  const saved = Number(read(APP_KEY));
  if (Number.isFinite(saved) && saved > 0) return saved;
  // Not every phone reports the referrer. Opened full screen on Android without a version = the first
  // APK (or the Chrome-installed app): both are older than any published APK.
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || window.matchMedia?.("(display-mode: fullscreen)").matches;
  if (standalone && /Android/.test(navigator.userAgent)) return 1;
  return null;
}

/** Opens the updater on demand (Settings → "Check for updates"), even when it was snoozed. */
export function checkForAppUpdate() {
  window.dispatchEvent(new Event("azc-app-update"));
}

const mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`;

/**
 * "New version" pop-up for the Android app. Downloads the APK inside the app with a progress ring,
 * then hands it to Android to install. Shown only inside the Android app, when a newer build is
 * published in /downloads/android.json. "Later" hides it for a day. Add ?appupdate=preview to see it.
 */
export function AppUpdate() {
  const [release, setRelease] = useState<Release | null>(null);
  const [current, setCurrent] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("offer");
  const [progress, setProgress] = useState(0);
  const [received, setReceived] = useState(0);
  const [file, setFile] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [upToDate, setUpToDate] = useState(false);

  // Manual check: always shows the sheet, with "up to date" when nothing newer exists.
  useEffect(() => {
    const onCheck = () => {
      fetch("/downloads/android.json", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((r: Release | null) => {
          if (!r) return;
          const version = installedVersion();
          setCurrent(version);
          setUpToDate(Boolean(version && version >= r.versionCode));
          setPhase("offer");
          setProgress(0);
          setClosing(false);
          setRelease(r);
        })
        .catch(() => {});
    };
    window.addEventListener("azc-app-update", onCheck);
    return () => window.removeEventListener("azc-app-update", onCheck);
  }, []);

  useEffect(() => {
    const preview = new URL(window.location.href).searchParams.get("appupdate") === "preview";
    const version = preview ? 1 : installedVersion();
    if (!version) return;
    if (!preview && Number(read(SNOOZE_KEY) ?? 0) > Date.now()) return;
    let live = true;
    fetch("/downloads/android.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((r: Release | null) => {
        if (!live || !r || r.versionCode <= version) return;
        setCurrent(version);
        setRelease(r);
        haptic("select");
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!release || typeof document === "undefined") return null;

  function close(snooze: boolean) {
    if (snooze) write(SNOOZE_KEY, String(Date.now() + 24 * 3600e3));
    setClosing(true);
    setTimeout(() => setRelease(null), 220);
  }

  async function download() {
    if (!release) return;
    setPhase("downloading");
    setProgress(0);
    try {
      const res = await fetch(release.url, { cache: "no-store" });
      if (!res.ok || !res.body) throw new Error("download");
      const total = Number(res.headers.get("content-length")) || release.size || 0;
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.length;
        setReceived(got);
        if (total) setProgress(Math.min(1, got / total));
      }
      const blob = new Blob(chunks as BlobPart[], { type: "application/vnd.android.package-archive" });
      setFile(URL.createObjectURL(blob));
      setProgress(1);
      setPhase("ready");
      haptic("success");
    } catch {
      setPhase("failed");
      haptic("error");
    }
  }

  function install() {
    if (!file || !release) return;
    const a = document.createElement("a");
    a.href = file;
    a.download = `app-${release.versionName}.apk`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const R = 46;
  const C = 2 * Math.PI * R;

  return createPortal(
    <div className={`fixed inset-0 z-[70] flex items-end justify-center sm:items-center ${closing ? "sheet-closing" : ""}`} role="dialog" aria-modal="true" aria-label="App update">
      <div className="sheet-backdrop absolute inset-0 bg-ink/80 backdrop-blur-md" onClick={() => phase !== "downloading" && close(true)} />
      <div className="sheet-panel pb-safe relative w-full overflow-hidden rounded-t-[32px] border-t border-rule bg-coal sm:max-w-md sm:rounded-[32px] sm:border">
        {/* Glow + rings behind the app icon */}
        <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgb(239_68_68/0.25),transparent_65%)]" />
        <div className="relative px-6 pb-6 pt-8 text-center">
          <div className="relative mx-auto mb-6 grid size-28 place-items-center">
            {phase === "offer" ? (
              <>
                <span className="pulse-ring absolute inset-0 rounded-full border border-bone/40" />
                <span className="pulse-ring absolute inset-0 rounded-full border border-bone/25 [animation-delay:700ms]" />
              </>
            ) : null}
            <svg viewBox="0 0 100 100" className="absolute inset-0 size-full -rotate-90" aria-hidden>
              <circle cx="50" cy="50" r={R} fill="none" stroke="var(--color-graphite)" strokeWidth="4" />
              <circle
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={phase === "failed" ? "var(--color-danger)" : "var(--color-bone)"}
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - (phase === "offer" ? 0 : progress))}
                style={{ transition: "stroke-dashoffset 200ms linear" }}
              />
            </svg>
            <span className={`grid size-20 place-items-center rounded-[22px] bg-ink shadow-[0_20px_40px_-20px_rgb(239_68_68/0.6)] ${phase === "offer" ? "pulse-core" : ""}`}>
              {phase === "ready" ? <Icon name="check" className="size-9 text-success" stroke={2.4} /> : <LogoMark className="size-14" />}
            </span>
          </div>

          <p className="text-xs font-medium text-mist">
            {current && !upToDate ? (
              <>
                <span className="tabular rounded-full border border-rule px-2 py-0.5">{current === 1 ? "1.0" : `v${current}`}</span>
                <Icon name="chevron" className="mx-1.5 inline size-3 text-ash" />
              </>
            ) : null}
            <span className="tabular rounded-full bg-bone px-2 py-0.5 font-semibold text-ink">{release.versionName}</span>
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">
            {phase === "ready" ? "Ready to install" : phase === "downloading" ? "Downloading…" : phase === "failed" ? "Download stopped" : upToDate ? "You're up to date" : current ? `New version of ${APP_SHORT_NAME}` : "Get the Android app"}
          </h2>

          {phase === "offer" && upToDate ? <p className="mt-2 text-sm text-mist">This phone has the latest app. You can download it again if something looks wrong.</p> : null}
          {phase === "offer" && !upToDate && release.notes?.length ? (
            <ul className="mx-auto mt-4 grid max-w-xs gap-2 text-left text-sm">
              {release.notes.map((n, i) => (
                <li key={n} className="rise-in flex items-start gap-2.5" style={{ animationDelay: `${120 + i * 70}ms` }}>
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-success/15 text-success">
                    <Icon name="check" className="size-3" stroke={2.6} />
                  </span>
                  <span className="text-mist">{n}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {phase === "downloading" ? (
            <p className="tabular mt-2 text-sm text-mist">
              {Math.round(progress * 100)}% · {mb(received)}
              {release.size ? ` of ${mb(release.size)}` : ""}
            </p>
          ) : null}
          {phase === "ready" ? <p className="mx-auto mt-2 max-w-xs text-sm text-mist">Tap Install, then open the download and tap Install again. You stay signed in.</p> : null}
          {phase === "failed" ? <p className="mt-2 text-sm text-mist">Check your connection and try again.</p> : null}

          <div className="mt-7 grid gap-2">
            {phase === "offer" || phase === "failed" ? (
              <button type="button" onClick={download} className="press flex h-14 items-center justify-center gap-2 rounded-full bg-bone text-base font-semibold text-ink">
                <Icon name="upload" className="size-5 rotate-180" /> {phase === "failed" ? "Try again" : `${upToDate ? "Download again" : current ? "Update now" : "Download"}${release.size ? ` · ${mb(release.size)}` : ""}`}
              </button>
            ) : null}
            {phase === "ready" ? (
              <button type="button" onClick={install} className="press flex h-14 items-center justify-center gap-2 rounded-full bg-bone text-base font-semibold text-ink">
                <Icon name="check" className="size-5" /> Install
              </button>
            ) : null}
            {phase !== "downloading" ? (
              <button type="button" onClick={() => close(phase !== "ready")} className="press h-11 text-sm text-mist">
                {phase === "ready" ? "Close" : "Later"}
              </button>
            ) : (
              <p className="h-11 text-xs leading-[2.75rem] text-ash">Keep the app open while it downloads.</p>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
