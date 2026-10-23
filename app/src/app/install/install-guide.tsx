"use client";

import { APP_SHORT_NAME } from "@/lib/brand";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Sheet } from "@/components/sheet";
import { Icon } from "@/components/icons";
import { AndroidStep1, AndroidStep2, IosStep1, IosStep2, IosStep3, IosStep4 } from "@/components/install-steps";

type Device = "ios" | "ios-other-browser" | "android" | "desktop";
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

function detect(): Device {
  const ua = navigator.userAgent;
  const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/.test(ua) || iPadOS) return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? "ios-other-browser" : "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

function Step({ n, title, body, art }: { n: number; title: string; body?: string; art: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-3xl border border-rule p-4">
      <button type="button" onClick={() => setOpen(true)} className="press block w-full" aria-label={`Enlarge step ${n}: ${title}`}>
        <div className="mx-auto w-40">{art}</div>
      </button>
      <p className="mt-3 font-semibold">
        <span className="tabular mr-2 text-ash">{n}</span>
        {title}
      </p>
      {body ? <p className="mt-1 text-sm text-mist">{body}</p> : null}
      <Sheet open={open} onClose={() => setOpen(false)} title={`Step ${n}`}>
        <div className="mx-auto w-full max-w-xs">{art}</div>
        <p className="mt-4 text-center font-semibold">{title}</p>
        {body ? <p className="mt-1 text-center text-sm text-mist">{body}</p> : null}
      </Sheet>
    </li>
  );
}

/** Detects the phone, offers a one-tap install where the browser allows it, and shows illustrated steps otherwise. */
export function InstallGuide() {
  const [device, setDevice] = useState<Device | null>(null);
  const [view, setView] = useState<"ios" | "android" | null>(null);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const d = detect();
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => setDone(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    // Read browser-only facts after mount (they do not exist during server render).
    const id = requestAnimationFrame(() => {
      setDevice(d);
      setView(d === "android" ? "android" : "ios");
      setInstalled(standalone);
    });
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") setDone(true);
    setPrompt(null);
  }

  if (!device) return <div className="h-40" />;

  if (installed || done) {
    return (
      <div className="rounded-3xl border border-success/50 p-6">
        <p className="text-lg font-semibold text-success">{installed ? "You are using the app." : "Installed."}</p>
        <p className="mt-1 text-sm text-mist">Open {APP_SHORT_NAME} from your home screen from now on.</p>
        <Link href="/" className="press mt-4 inline-flex h-12 items-center rounded-full bg-bone px-6 text-sm font-semibold text-ink">Open</Link>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-4 text-sm text-ash">
        Detected: <span className="text-bone">{device === "ios" ? "iPhone / iPad (Safari)" : device === "ios-other-browser" ? "iPhone / iPad (not Safari)" : device === "android" ? "Android" : "Computer"}</span>
      </p>

      {prompt ? (
        <button type="button" onClick={install} className="press mb-6 h-14 w-full rounded-full bg-bone text-base font-semibold text-ink">Install {APP_SHORT_NAME}</button>
      ) : device === "ios-other-browser" ? (
        <div className="mb-6 rounded-2xl border border-attention/50 p-4 text-sm text-attention">
          Open this page in <strong>Safari</strong> for the most reliable install. Copy the link, open Safari, paste it, then follow the steps.
          <button type="button" onClick={() => navigator.clipboard?.writeText(window.location.href)} className="press mt-3 block h-10 rounded-full border border-attention/60 px-4">Copy link</button>
        </div>
      ) : device === "desktop" ? (
        <div className="mb-6 rounded-2xl border border-rule p-4 text-sm text-mist">
          On a computer, Chrome and Edge show an install icon in the address bar. For your phone, open <strong className="text-bone">this same address</strong> there and come back to this page.
        </div>
      ) : null}

      <div className="mb-4 grid grid-cols-2 gap-1 rounded-full border border-rule p-1 text-sm">
        {(["ios", "android"] as const).map((v) => (
          <button key={v} type="button" onClick={() => setView(v)} className={`press h-10 rounded-full ${view === v ? "bg-bone font-semibold text-ink" : "text-mist"}`}>
            {v === "ios" ? "iPhone" : "Android"}
          </button>
        ))}
      </div>
      <p className="mb-4 text-xs text-ash">Tap any picture to make it bigger.</p>

      {view === "ios" ? (
        <ol className="grid gap-3 sm:grid-cols-2">
          <Step n={1} title="Tap the Share button" body="The square with an arrow, at the bottom of Safari (top right on iPad)." art={<IosStep1 />} />
          <Step n={2} title="Tap “Add to Home Screen”" body="Scroll down the list if you don't see it." art={<IosStep2 />} />
          <Step n={3} title="Tap “Add”" body={`Top right. Keep the name ${APP_SHORT_NAME}.`} art={<IosStep3 />} />
          <Step n={4} title="Open it from your home screen" body="It opens full screen, like any app. Sign in once." art={<IosStep4 />} />
        </ol>
      ) : (
        <>
        <div className="mb-4 rounded-3xl border border-rule bg-char p-5">
          <p className="font-semibold">Android app (APK)</p>
          <p className="mt-1 text-sm text-mist">The same app as a normal Android download. After it downloads, tap it and allow &ldquo;Install unknown apps&rdquo; for Chrome when Android asks.</p>
          <a href="/downloads/az-video-editor.apk" download className="press mt-4 flex h-12 items-center justify-center gap-2 rounded-full bg-bone text-sm font-semibold text-ink">
            <Icon name="phone" className="size-4" /> Download the Android app
          </a>
          <p className="mt-3 text-xs text-ash">Or install it straight from Chrome:</p>
        </div>
        <ol className="grid gap-3 sm:grid-cols-2">
          <Step n={1} title="Tap the ⋮ menu" body="Top right in Chrome. If an Install button showed above, just tap that instead." art={<AndroidStep1 />} />
          <Step n={2} title="Tap “Install app”" body="Some phones say “Add to Home screen”. Then tap Install." art={<AndroidStep2 />} />
        </ol>
        </>
      )}
    </div>
  );
}
