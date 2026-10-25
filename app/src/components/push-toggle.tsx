"use client";

import { useEffect, useState } from "react";
import { removePushSubscription, savePushSubscription, sendTestPush } from "@/app/actions/push";
import { Icon } from "@/components/icons";
import { haptic } from "@/lib/haptics";
import { APP_SHORT_NAME } from "@/lib/brand";

const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function keyBytes(base64url: string): Uint8Array {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type State = "loading" | "unsupported" | "off" | "on" | "blocked";

/** Turn on phone notifications (edit ready, client upload, post failed…). One per phone. */
export function PushToggle({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});

  useEffect(() => {
    let live = true;
    (async () => {
      if (!KEY || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return live && setState("unsupported");
      if (Notification.permission === "denied") return live && setState("blocked");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (live) setState(sub && Notification.permission === "granted" ? "on" : "off");
    })().catch(() => live && setState("unsupported"));
    return () => {
      live = false;
    };
  }, []);

  async function turnOn() {
    setBusy(true);
    setMsg({});
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY) as BufferSource }));
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const r = await savePushSubscription(json);
      if (r.error) throw new Error(r.error);
      haptic("success");
      setState("on");
      setMsg({ ok: "On. You'll get a notification when an edit is ready." });
    } catch (e) {
      haptic("error");
      setMsg({ error: (e as Error).message || "Couldn't turn notifications on." });
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await removePushSubscription(sub.endpoint);
      await sub.unsubscribe().catch(() => {});
    }
    setState("off");
    setBusy(false);
  }

  async function test() {
    setBusy(true);
    const r = await sendTestPush();
    setBusy(false);
    setMsg(r.error ? { error: r.error } : { ok: "Sent. It should pop up in a few seconds." });
  }

  if (state === "loading" || (compact && state !== "off")) return null;

  if (compact) {
    return (
      <button type="button" onClick={turnOn} disabled={busy} className="press rise-in mb-4 flex w-full items-center gap-3 rounded-2xl border border-rule bg-coal px-4 py-3 text-left">
        <Icon name="bell" className="size-5 shrink-0" />
        <span className="min-w-0 flex-1 text-sm"><span className="font-semibold">Get notified</span> <span className="text-mist">when an edit is ready or a client uploads.</span></span>
        <span className="shrink-0 rounded-full bg-bone px-3 py-1.5 text-xs font-semibold text-ink">{busy ? "…" : "Turn on"}</span>
      </button>
    );
  }

  return (
    <div className="grid gap-2">
      <div className="flex min-h-12 items-center justify-between gap-4 rounded-2xl border border-rule px-4 py-2">
        <span>
          <span className="block text-sm">Notifications on this phone</span>
          <span className="block text-xs text-ash">
            {state === "unsupported" ? "Install the app (Android app or Add to Home Screen) to get them." : state === "blocked" ? `Blocked. Allow notifications for ${APP_SHORT_NAME} in your phone's settings.` : "Edit ready, client upload, post failed…"}
          </span>
        </span>
        {state === "on" ? (
          <button type="button" onClick={turnOff} disabled={busy} className="press h-9 shrink-0 rounded-full border border-rule px-3 text-xs text-mist">Turn off</button>
        ) : state === "off" ? (
          <button type="button" onClick={turnOn} disabled={busy} className="press h-9 shrink-0 rounded-full bg-bone px-3 text-xs font-semibold text-ink">{busy ? "…" : "Turn on"}</button>
        ) : null}
      </div>
      {state === "on" ? (
        <button type="button" onClick={test} disabled={busy} className="press h-11 rounded-full border border-rule text-sm text-mist">Send a test notification</button>
      ) : null}
      {msg.ok ? <p className="text-xs text-success">{msg.ok}</p> : null}
      {msg.error ? <p className="text-xs text-danger">{msg.error}</p> : null}
    </div>
  );
}
