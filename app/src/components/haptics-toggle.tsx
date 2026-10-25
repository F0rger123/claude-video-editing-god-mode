"use client";

import { useEffect, useState } from "react";
import { canVibrate, haptic, hapticStrength } from "@/lib/haptics";
import { APP_SHORT_NAME } from "@/lib/brand";

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage blocked
  }
}

/** Per-phone vibration settings (stored on this device only): on/off, strength, and a test. */
export function HapticsToggle() {
  const [on, setOn] = useState(true);
  const [strong, setStrong] = useState(false);
  const [supported, setSupported] = useState(true);
  const [result, setResult] = useState<"ok" | "blocked" | null>(null);
  useEffect(() => {
    let off = false;
    try {
      off = localStorage.getItem("azc-haptics") === "off";
    } catch {
      // storage blocked
    }
    const id = requestAnimationFrame(() => {
      setOn(!off);
      setStrong(hapticStrength() === "strong");
      setSupported(canVibrate());
    });
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div className="grid gap-2">
      <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-2xl border border-rule px-4">
        <span className="text-sm">Vibration on taps (this phone)</span>
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => {
            save("azc-haptics", e.target.checked ? "on" : "off");
            setOn(e.target.checked);
            if (e.target.checked) haptic("success");
          }}
          className="size-5 accent-bone"
        />
      </label>
      {on && supported ? (
        <>
          <div className="grid grid-cols-2 gap-1 rounded-full border border-rule p-1 text-sm">
            {(["normal", "strong"] as const).map((s) => (
              <button
                key={s}
                type="button"
                data-haptic="none"
                onClick={() => {
                  save("azc-haptics-strength", s);
                  setStrong(s === "strong");
                  haptic("success");
                }}
                className={`press h-9 rounded-full ${(s === "strong") === strong ? "bg-bone font-semibold text-ink" : "text-mist"}`}
              >
                {s === "normal" ? "Normal" : "Strong"}
              </button>
            ))}
          </div>
          <button type="button" data-haptic="none" onClick={() => setResult(haptic("success") ? "ok" : "blocked")} className="press h-11 rounded-full border border-rule text-sm text-mist">
            Test vibration
          </button>
        </>
      ) : null}
      {!supported ? <p className="text-xs text-ash">This browser can&apos;t vibrate. On Android, use the {APP_SHORT_NAME} app or Chrome.</p> : null}
      {result === "ok" ? <p className="text-xs text-ash">Sent a vibration. Felt nothing? Try Strong, and check Settings → Sound &amp; vibration → Vibration intensity → Touch feedback is on (and Battery saver is off).</p> : null}
      {result === "blocked" ? <p className="text-xs text-attention">Your phone blocked the vibration. Tap anywhere in the app once, then test again. If it still says this, Chrome&apos;s vibration is turned off for this app in Android settings.</p> : null}
    </div>
  );
}
