"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { haptic } from "@/lib/haptics";

/**
 * Download the finished edit, or (on phones) hand it to the share sheet so it can go straight to
 * Photos / Gallery, Drive, WhatsApp… Falls back to a normal download where sharing files isn't supported.
 */
export function SaveVideo({ url, fileName }: { url: string; fileName: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const canShare = typeof navigator !== "undefined" && "canShare" in navigator;

  async function share() {
    setState("busy");
    try {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], fileName, { type: blob.type || "video/mp4" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: fileName });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(file);
        a.download = fileName;
        a.click();
      }
      haptic("success");
      setState("done");
    } catch (e) {
      if ((e as Error).name === "AbortError") return setState("idle");
      haptic("error");
      setState("error");
    }
  }

  return (
    <div className="mb-6 grid grid-cols-2 gap-2">
      <a href={url} download={fileName} className="press flex h-14 items-center justify-center gap-2 rounded-full bg-bone font-semibold text-ink">
        <Icon name="upload" className="size-5 rotate-180" /> Download
      </a>
      <button type="button" onClick={share} disabled={state === "busy"} className="press flex h-14 items-center justify-center gap-2 rounded-full border border-rule-strong font-semibold disabled:opacity-60">
        <Icon name={state === "done" ? "check" : "send"} className="size-5" />
        {state === "busy" ? "Preparing…" : state === "done" ? "Saved" : state === "error" ? "Try again" : canShare ? "Save to phone" : "Share"}
      </button>
    </div>
  );
}
