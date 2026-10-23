"use client";

/**
 * Haptic feedback on phones.
 *   Android (Chrome):  the Vibration API.
 *   iPhone (iOS 18+):  Safari has no Vibration API. Clicking the label of a native
 *                      `<input type="checkbox" switch>` plays the system "toggle" haptic, so a fresh hidden
 *                      switch is created, clicked and removed inside the user's tap (the technique used by
 *                      the open-source ios-haptics package). Haptics are not motion, so Reduce Motion
 *                      does not turn them off; the per-phone switch in Settings does.
 */
export type Haptic = "tap" | "select" | "success" | "warning" | "error";

// Many Android vibration motors don't spin up for pulses under ~20 ms, so taps are 20+ ms.
const PATTERN: Record<Haptic, number | number[]> = {
  tap: 22,
  select: 30,
  success: [28, 70, 42],
  warning: [45, 90, 45],
  error: [55, 70, 55, 70, 55],
};

/** Can this browser vibrate at all? (Chrome on Android: yes. iPhone uses the switch trick. Desktop: no.) */
export function canVibrate(): boolean {
  return typeof navigator !== "undefined" && (isIOS() || typeof navigator.vibrate === "function");
}

const isIOS = () =>
  typeof navigator !== "undefined" && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1));

function iosTick() {
  const label = document.createElement("label");
  label.ariaHidden = "true";
  label.dataset.haptic = "none"; // our own click listener ignores it
  label.style.display = "none";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  label.appendChild(input);
  document.head.appendChild(label);
  label.click();
  document.head.removeChild(label);
}

export function hapticsEnabled(): boolean {
  try {
    return localStorage.getItem("azc-haptics") !== "off";
  } catch {
    return true;
  }
}

export function haptic(kind: Haptic = "tap") {
  if (typeof window === "undefined" || !hapticsEnabled()) return;
  if (isIOS()) {
    iosTick();
    if (kind === "success" || kind === "warning" || kind === "error") setTimeout(iosTick, 120);
    return;
  }
  try {
    navigator.vibrate?.(PATTERN[kind]);
  } catch {
    // Not supported (desktop Safari, Firefox): nothing to do.
  }
}
