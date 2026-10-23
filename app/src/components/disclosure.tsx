"use client";

import { useState, type ReactNode } from "react";

/** Show/hide panel that keeps its own open state across server refreshes (unlike <details open>). */
export function Disclosure({ label, initiallyOpen = false, children }: { label: string; initiallyOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <div className="mb-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`press flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold ${open ? "border border-rule-strong text-bone" : "bg-bone text-ink"}`}
      >
        {open ? "Close" : label}
      </button>
      {open ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}
