"use client";

import { Icon } from "@/components/icons";
import { checkForAppUpdate } from "@/components/app-update";

/** Settings → "Check for updates": opens the Android app updater (or offers the app). */
export function AppUpdateButton() {
  return (
    <button type="button" onClick={checkForAppUpdate} className="press flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border border-rule px-4 text-left">
      <span>
        <span className="block text-sm">Android app</span>
        <span className="block text-xs text-ash">Check for a new version, or download it again</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-bone px-3 py-1.5 text-xs font-semibold text-ink">
        <Icon name="refresh" className="size-3.5" /> Check for updates
      </span>
    </button>
  );
}
