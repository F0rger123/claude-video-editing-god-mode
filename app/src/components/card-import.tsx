"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Sheet } from "@/components/sheet";
import { haptic } from "@/lib/haptics";

/** What cameras write: video (MP4/MOV/MTS/MXF…) and photos (JPEG/HEIC/RAW). Sidecars (.XML, .THM, .LRF…) are skipped. */
export const CAMERA_VIDEO = /\.(mp4|mov|m4v|mts|m2ts|mxf|avi|mkv|3gp|insv|360)$/i;
export const CAMERA_PHOTO = /\.(jpe?g|heic|heif|png|dng|arw|cr2|cr3|nef|raf|orf|rw2)$/i;
const ACCEPT = "video/*,image/*,.mts,.m2ts,.mxf,.insv,.dng,.arw,.cr2,.cr3,.nef,.raf,.orf,.rw2,.heic";

type Clip = { id: string; file: File; video: boolean; selected: boolean };

const gb = (bytes: number) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`);
const dayOf = (f: File) => new Date(f.lastModified).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const timeOf = (f: File) => new Date(f.lastModified).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

function Thumb({ clip }: { clip: Clip }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(clip.file);
    const id = requestAnimationFrame(() => setSrc(url));
    return () => {
      cancelAnimationFrame(id);
      URL.revokeObjectURL(url);
    };
  }, [clip.file]);
  if (!src) return <span className="size-full bg-graphite" />;
  // Browsers can't preview RAW photos or MTS/MXF: show an icon instead of a broken frame.
  const previewable = clip.video ? /\.(mp4|mov|m4v|webm)$/i.test(clip.file.name) : /\.(jpe?g|png|heic|webp)$/i.test(clip.file.name);
  if (!previewable) return <span className="grid size-full place-items-center bg-graphite text-ash"><Icon name={clip.video ? "film" : "image"} className="size-6" /></span>;
  return clip.video ? (
    <video src={`${src}#t=0.5`} preload="metadata" muted playsInline className="size-full object-cover" />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="size-full object-cover" />
  );
}

/**
 * Import from a camera's SD card (through a USB-C card reader) or any USB drive.
 * Android's file picker shows the card as a drive: open it, go to DCIM, select the clips.
 * Where the browser supports it, a whole folder can be picked at once. Clips are shown by day with
 * thumbnails; tick the ones for this video, then they join the footage like any other file.
 */
export function CardImport({ open, onClose, onImport }: { open: boolean; onClose: () => void; onImport: (files: File[]) => void }) {
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [folderOk, setFolderOk] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setFolderOk("webkitdirectory" in document.createElement("input")));
    return () => cancelAnimationFrame(id);
  }, []);

  function take(list: FileList | null) {
    if (!list) return;
    const media = Array.from(list).filter((f) => CAMERA_VIDEO.test(f.name) || CAMERA_PHOTO.test(f.name) || f.type.startsWith("video/") || f.type.startsWith("image/"));
    const next = media
      .sort((a, b) => a.lastModified - b.lastModified)
      .map((file) => ({ id: crypto.randomUUID(), file, video: CAMERA_VIDEO.test(file.name) || file.type.startsWith("video/"), selected: CAMERA_VIDEO.test(file.name) || file.type.startsWith("video/") }));
    setClips((cur) => [...cur, ...next.filter((n) => !cur.some((c) => c.file.name === n.file.name && c.file.size === n.file.size))]);
    if (next.length) haptic("success");
  }

  const groups = useMemo(() => {
    const map = new Map<string, Clip[]>();
    for (const c of clips) map.set(dayOf(c.file), [...(map.get(dayOf(c.file)) ?? []), c]);
    return [...map.entries()];
  }, [clips]);
  const chosen = clips.filter((c) => c.selected);
  const size = chosen.reduce((n, c) => n + c.file.size, 0);
  const toggle = (id: string) => setClips((cur) => cur.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c)));
  const setAll = (v: boolean) => setClips((cur) => cur.map((c) => ({ ...c, selected: v })));

  return (
    <Sheet open={open} onClose={onClose} title="Camera card or USB">
      <input ref={filesInput} type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => { take(e.target.files); e.target.value = ""; }} />
      {/* @ts-expect-error webkitdirectory is a non-standard attribute, supported by Chrome */}
      <input ref={folderInput} type="file" multiple webkitdirectory="" className="sr-only" onChange={(e) => { take(e.target.files); e.target.value = ""; }} />

      {!clips.length ? (
        <div className="grid gap-4">
          <ol className="grid gap-2 text-sm">
            {[
              ["Plug in the card", "SD card in a USB-C reader (or a USB drive), into the phone."],
              ["Tap Choose clips", "In the picker, tap ☰ (top left) and pick the card. It's usually called USB drive or the card's name."],
              ["Open DCIM and select", "Long-press the first clip, then tap the others. Tap Select."],
            ].map(([t, b], i) => (
              <li key={t} className="rise-in flex gap-3 rounded-2xl border border-rule bg-char p-3" style={{ animationDelay: `${i * 60}ms` }}>
                <span className="tabular grid size-7 shrink-0 place-items-center rounded-full bg-bone text-sm font-semibold text-ink">{i + 1}</span>
                <span>
                  <span className="block font-medium">{t}</span>
                  <span className="block text-ash">{b}</span>
                </span>
              </li>
            ))}
          </ol>
          <button type="button" onClick={() => filesInput.current?.click()} className="press flex h-14 items-center justify-center gap-2 rounded-full bg-bone font-semibold text-ink">
            <Icon name="film" className="size-5" /> Choose clips
          </button>
          {folderOk ? (
            <button type="button" onClick={() => folderInput.current?.click()} className="press flex h-12 items-center justify-center gap-2 rounded-full border border-rule-strong text-sm">
              <Icon name="layers" className="size-4" /> Pick a whole folder (e.g. DCIM)
            </button>
          ) : null}
          <p className="text-center text-xs text-ash">Nothing is copied off the card. Only the clips you tick are uploaded.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="tabular flex-1 text-mist">{chosen.length} of {clips.length} selected · {gb(size)}</span>
            <button type="button" onClick={() => setAll(chosen.length !== clips.length)} className="press h-9 rounded-full border border-rule px-3 text-xs">
              {chosen.length === clips.length ? "Select none" : "Select all"}
            </button>
            <button type="button" onClick={() => filesInput.current?.click()} className="press h-9 rounded-full border border-rule px-3 text-xs">More</button>
          </div>
          {groups.map(([day, list]) => (
            <section key={day}>
              <h3 className="mb-2 text-sm text-mist">{day}</h3>
              <div className="grid grid-cols-3 gap-2">
                {list.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={c.selected}
                    aria-label={`${c.file.name}, ${timeOf(c.file)}`}
                    onClick={() => toggle(c.id)}
                    className={`press relative aspect-[3/4] overflow-hidden rounded-2xl border-2 ${c.selected ? "border-bone" : "border-transparent opacity-60"}`}
                  >
                    <Thumb clip={c} />
                    <span className={`absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full border-2 ${c.selected ? "border-bone bg-bone text-ink" : "border-bone/70 bg-ink/40"}`}>
                      {c.selected ? <Icon name="check" className="size-3.5" stroke={3} /> : null}
                    </span>
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/90 to-transparent px-2 pb-1.5 pt-5 text-left text-[10px] leading-tight text-bone">
                      <span className="block truncate font-medium">{c.file.name}</span>
                      <span className="tabular text-mist">{timeOf(c.file)} · {gb(c.file.size)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
          <div className="sticky bottom-0 grid grid-cols-[auto_1fr] gap-2 bg-coal pb-2 pt-3">
            <button type="button" onClick={() => setClips([])} className="press h-14 rounded-full border border-rule px-5 text-sm">Clear</button>
            <button
              type="button"
              disabled={!chosen.length}
              onClick={() => {
                onImport(chosen.map((c) => c.file));
                setClips([]);
                onClose();
              }}
              className="press h-14 rounded-full bg-bone font-semibold text-ink disabled:opacity-40"
            >
              Add {chosen.length} {chosen.length === 1 ? "file" : "files"}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
