"use client";

import { useEffect, useState } from "react";
import { canVibrate, haptic } from "@/lib/haptics";

/** Per-phone switch for vibration feedback (stored on this device only), with a test button. */
export function HapticsToggle() {
  const [on, setOn] = useState(true);
  const [supported, setSupported] = useState(true);
  const [tested, setTested] = useState(false);
  useEffect(() => {
    let off = false;
    try {
      off = localStorage.getItem("azc-haptics") === "off";
    } catch {
      // storage blocked
    }
    const id = requestAnimationFrame(() => {
      setOn(!off);
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
            try {
              localStorage.setItem("azc-haptics", e.target.checked ? "on" : "off");
            } catch {
              // storage blocked
            }
            setOn(e.target.checked);
            if (e.target.checked) haptic("success");
          }}
          className="size-5 accent-bone"
        />
      </label>
      {on && supported ? (
        <button
          type="button"
          data-haptic="none"
          onClick={() => {
            haptic("success");
            setTested(true);
          }}
          className="press h-11 rounded-full border border-rule text-sm text-mist"
        >
          Test vibration
        </button>
      ) : null}
      {!supported ? <p className="text-xs text-ash">This browser can&apos;t vibrate. On Android, open the app in Chrome or install it from Chrome.</p> : null}
      {tested ? <p className="text-xs text-ash">Felt nothing? On Android, turn on Settings → Sound &amp; vibration → Vibration &amp; haptics → Touch feedback, and turn off Battery saver.</p> : null}
    </div>
  );
}
