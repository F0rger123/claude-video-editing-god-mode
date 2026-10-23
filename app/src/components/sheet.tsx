"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { haptic } from "@/lib/haptics";

const CLOSE_MS = 220;
const DRAG_CLOSE = 110;

/**
 * Bottom sheet on phones, centred panel on wider screens. Closes on backdrop tap, Escape, or by
 * dragging the top bar down. Slides out instead of vanishing. Rendered into <body> so page
 * animations and sticky headers never affect where it sits.
 */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; at: number } | null>(null);
  const [shown, setShown] = useState(open);
  const [closing, setClosing] = useState(false);
  const [dy, setDy] = useState(0);
  const [dragging, setDragging] = useState(false);

  // Opening shows at once; closing plays the slide-out, then unmounts.
  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => {
        setShown(true);
        setClosing(false);
        setDy(0);
      });
      return () => cancelAnimationFrame(id);
    }
    if (!shown) return;
    const id = requestAnimationFrame(() => setClosing(true));
    const t = setTimeout(() => {
      setShown(false);
      setClosing(false);
      setDy(0);
    }, CLOSE_MS);
    return () => {
      cancelAnimationFrame(id);
      clearTimeout(t);
    };
  }, [open, shown]);

  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close]);

  if (!shown || typeof document === "undefined") return null;

  const dragHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" || (e.target as HTMLElement).closest("button")) return;
      drag.current = { y: e.clientY, at: Date.now() };
      setDragging(true);
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!drag.current) return;
      setDy(Math.max(0, e.clientY - drag.current.y));
    },
    onPointerUp: () => {
      if (!drag.current) return;
      const fast = dy > 40 && Date.now() - drag.current.at < 250;
      drag.current = null;
      setDragging(false);
      if (dy > DRAG_CLOSE || fast) {
        haptic("tap");
        close();
      } else setDy(0);
    },
    onPointerCancel: () => {
      drag.current = null;
      setDragging(false);
      setDy(0);
    },
  };

  return createPortal(
    <div className={`fixed inset-0 z-50 flex items-end justify-center sm:items-center ${closing ? "sheet-closing" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet-backdrop absolute inset-0 bg-ink/70 backdrop-blur-sm" onClick={close} style={dy ? { opacity: Math.max(0.3, 1 - dy / 400) } : undefined} />
      <div
        ref={panel}
        tabIndex={-1}
        className={`sheet-panel pb-safe relative max-h-[88svh] w-full overflow-y-auto overscroll-contain rounded-t-3xl border-t border-rule bg-coal outline-none sm:max-w-lg sm:rounded-3xl sm:border ${dragging ? "" : "transition-transform duration-200 ease-out"}`}
        style={dy ? { transform: `translateY(${dy}px)` } : undefined}
      >
        <div className="sticky top-0 z-10 flex touch-none items-center justify-between bg-coal/95 px-5 pb-3 pt-5 backdrop-blur" {...dragHandlers}>
          <div aria-hidden className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-graphite sm:hidden" />
          <h2 className="t-title min-w-0 truncate pr-3">{title}</h2>
          <button type="button" onClick={close} className="press shrink-0 rounded-full px-3 py-1.5 text-sm text-mist hover:text-bone">
            Close
          </button>
        </div>
        <div className="px-5 pb-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
