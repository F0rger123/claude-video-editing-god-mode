"use client";

import { useEffect } from "react";
import { haptic, type Haptic } from "@/lib/haptics";

const SELECTOR = "button, a, [role=button], label, summary, select, input[type=checkbox], input[type=radio], input[type=range]";

function target(e: Event): HTMLElement | null {
  const el = (e.target as HTMLElement | null)?.closest<HTMLElement>(SELECTOR) ?? null;
  if (!el || el.closest("[data-haptic=none]") || (el as HTMLButtonElement).disabled) return null;
  return el;
}

function kindOf(el: HTMLElement): Haptic {
  const kind = el.closest<HTMLElement>("[data-haptic]")?.dataset.haptic as Haptic | undefined;
  // Outcome haptics (success / warning / error) play when the action finishes; the touch itself is a tap.
  return kind === "select" ? "select" : "tap";
}

/**
 * One listener for the whole app: every tappable control gives a short buzz.
 *   Android: on finger-down (instant). Chrome only lets a page vibrate after the person has tapped it
 *            once, so until then the buzz is played on the click instead.
 *   iPhone:  on click (the switch trick only works inside a real click).
 * Elements opt out with data-haptic="none". Mouse clicks stay silent.
 */
export function Haptics() {
  useEffect(() => {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    let lastBuzz = 0;
    let lastTouch = 0;

    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      lastTouch = Date.now();
      const el = target(e);
      if (!el) return;
      const active = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive ?? true;
      if (!active) return; // first tap of the visit: handled on click below
      haptic(kindOf(el));
      lastBuzz = Date.now();
    };
    const onClick = (e: MouseEvent) => {
      // Android: only fill in for touches that could not buzz on finger-down. iPhone: every click.
      if (!ios && (Date.now() - lastTouch > 1000 || Date.now() - lastBuzz < 1000)) return;
      const el = target(e);
      if (!el) return;
      haptic(kindOf(el));
      lastBuzz = Date.now();
    };
    if (!ios) document.addEventListener("pointerdown", onPointer, { capture: true, passive: true });
    document.addEventListener("click", onClick, { capture: true });
    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      document.removeEventListener("pointerdown", onPointer, { capture: true });
    };
  }, []);
  return null;
}
