"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { Sheet } from "@/components/sheet";
import { MEDIA_KIND_LABEL, type MediaKind } from "@/lib/domain/types";
import { formatDuration } from "@/lib/format";

type Media = { id: string; kind: string; file_name: string | null; url: string | null; body: string | null; duration_seconds: number | null; src: string | null; review_status?: string; review_note?: string | null };

/** Square preview tile; tap opens a full preview (video plays inline, muted until touched). */
export function MediaThumb({ media, selected, onToggle }: { media: Media; selected?: boolean; onToggle?: () => void }) {
  const [open, setOpen] = useState(false);
  const isVideo = ["video", "broll", "reference_video"].includes(media.kind);
  const isImage = ["photo", "logo", "reference_image"].includes(media.kind);
  return (
    <div className={`relative aspect-[3/4] overflow-hidden rounded-xl border bg-char ${selected ? "border-bone ring-2 ring-bone" : "border-rule"}`}>
      <button type="button" onClick={() => setOpen(true)} className="absolute inset-0 grid place-items-center" aria-label={`Preview ${media.file_name ?? media.kind}`}>
        {media.src && isVideo ? (
          <video src={`${media.src}#t=0.5`} preload="metadata" muted playsInline className="size-full object-cover" />
        ) : media.src && isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={media.src} alt="" className="size-full object-cover" loading="lazy" />
        ) : (
          <span className="grid gap-1 p-2 text-center text-xs text-mist">
            <Icon name={media.kind === "link" ? "link" : media.kind === "note" ? "note" : media.kind === "audio" ? "audio" : "film"} className="mx-auto size-5" />
            <span className="line-clamp-3 break-all">{media.url ?? media.body ?? media.file_name}</span>
          </span>
        )}
      </button>
      <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-ink/70 px-1.5 py-0.5 text-[10px] text-bone">
        {MEDIA_KIND_LABEL[media.kind as MediaKind] ?? media.kind}
        {media.duration_seconds ? ` · ${formatDuration(media.duration_seconds)}` : ""}
      </span>
      {media.review_status === "rejected" && media.review_note ? <span className="absolute inset-x-0 top-0 bg-danger/90 px-1.5 py-1 text-[10px] text-ink">{media.review_note}</span> : null}
      {onToggle ? (
        <button type="button" onClick={onToggle} aria-pressed={selected} aria-label={selected ? "Deselect" : "Select"} className={`press absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-full border ${selected ? "border-bone bg-bone text-ink" : "border-rule-strong bg-ink/60 text-transparent"}`}>
          <Icon name="check" className="size-4" />
        </button>
      ) : null}
      <Sheet open={open} onClose={() => setOpen(false)} title={media.file_name ?? MEDIA_KIND_LABEL[media.kind as MediaKind] ?? "Preview"}>
        {media.src && isVideo ? (
          <video src={media.src} controls playsInline autoPlay className="max-h-[70svh] w-full rounded-xl bg-ink" />
        ) : media.src && isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={media.src} alt="" className="max-h-[70svh] w-full rounded-xl object-contain" />
        ) : media.url ? (
          <a href={media.url} target="_blank" rel="noopener noreferrer" className="break-all text-bone underline underline-offset-4">{media.url}</a>
        ) : (
          <p className="whitespace-pre-wrap text-mist">{media.body ?? "No preview available."}</p>
        )}
      </Sheet>
    </div>
  );
}
