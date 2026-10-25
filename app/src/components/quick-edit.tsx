"use client";

import Link from "@/components/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { completeUpload, prepareUpload } from "@/app/actions/upload";
import { CAMERA_PHOTO, CAMERA_VIDEO, CardImport } from "@/components/card-import";
import { Icon } from "@/components/icons";
import { Teleprompter } from "@/components/teleprompter";
import { CaptionPicker } from "@/components/caption-picker";
import type { BrandKitSummary } from "@/components/upload-composer";
import { haptic } from "@/lib/haptics";
import { PLATFORM_LABEL, type MediaKind, type Platform } from "@/lib/domain/types";

type Pick = { id: string; file: File; reference: boolean; progress: number };
export type MakeWorkspace = { id: string; name: string; is_agency: boolean; allowed_platforms: string[] };
export type MakeIdea = { id: string; workspace_id: string; hook: string; form: "short" | "long"; script?: string | null; outline?: string | null };

const isImage = (f: File) => f.type.startsWith("image/") || (CAMERA_PHOTO.test(f.name) && !CAMERA_VIDEO.test(f.name));
const mb = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1e6))} MB`);
const JUST_ME = "me";
/** One-tap looks that add a line to "What should it look like?" (the editor has a skill for each). */
const LOOKS = [
  { label: "Motion graphics", text: "Lots of animated text, cards and motion graphics (HyperFrames)" },
  { label: "Paper collage B-roll", text: "Paper-collage B-roll for the explainer moments (collage skill)" },
  { label: "Cinematic film look", text: "A cinematic film look, from the Lemo-Opuscar styles that fit the brand" },
  { label: "Punch zooms", text: "Punch-zooms on key words and slow pushes on the main point" },
  { label: "Show what I mention", text: "Show every website, brand and person I mention on screen" },
  { label: "Fast pace", text: "Fast pace: cut every 2-3 seconds, no dead air" },
  { label: "Calm & clean", text: "Calm and clean: fewer effects, simple captions, smooth cuts" },
];

function put(url: string, file: File, onProgress: (p: number) => void): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.send(file);
  });
}

function Label({ children, hint }: { children: string; hint?: string }) {
  return (
    <p className="mb-2 text-sm font-medium">
      {children} {hint ? <span className="font-normal text-ash">{hint}</span> : null}
    </p>
  );
}

/**
 * Make a video: everything on one screen, no wizard.
 *   Who it's for (just me = no posting, or a client) → footage (gallery, record with teleprompter,
 *   files, camera card) → optional idea, look, brand kit + colors, references → "Edit it".
 * The editor starts straight away; the video page then has Download / Save to phone.
 */
export function QuickEdit({
  workspaces,
  kits,
  ideas,
  initialFor,
  initialIdeaId,
  initialRecord = false,
}: {
  workspaces: MakeWorkspace[];
  kits: BrandKitSummary[];
  ideas: MakeIdea[];
  initialFor?: string | null;
  initialIdeaId?: string | null;
  initialRecord?: boolean;
}) {
  const router = useRouter();
  const pickInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const refInput = useRef<HTMLInputElement>(null);
  const agency = workspaces.find((w) => w.is_agency) ?? workspaces[0];
  const startIdea = ideas.find((i) => i.id === initialIdeaId);
  const [forId, setForId] = useState<string>(startIdea && startIdea.workspace_id !== agency?.id ? startIdea.workspace_id : initialFor && workspaces.some((w) => w.id === initialFor && !w.is_agency) ? initialFor : JUST_ME);
  const target = forId === JUST_ME ? agency : workspaces.find((w) => w.id === forId) ?? agency;
  const forClient = forId !== JUST_ME;
  const [ideaId, setIdeaId] = useState<string>(startIdea?.id ?? "");
  const idea = ideas.find((i) => i.id === ideaId);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [form, setForm] = useState<"short" | "long">(startIdea?.form ?? "short");
  const [wish, setWish] = useState("");
  const [links, setLinks] = useState("");
  const [kitFrom, setKitFrom] = useState<string>("auto"); // auto = the client's own kit; "none"; or a workspace id
  const [colors, setColors] = useState<string[]>([]);
  const [customColor, setCustomColor] = useState("#ef4444");
  const [platforms, setPlatforms] = useState<string[] | null>(null);
  const [captions, setCaptions] = useState("auto");
  const [voicePolish, setVoicePolish] = useState(true);
  const [faceTrack, setFaceTrack] = useState(true);
  const [cardOpen, setCardOpen] = useState(false);
  const [prompter, setPrompter] = useState(initialRecord && Boolean(startIdea));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const footage = picks.filter((p) => !p.reference);
  const refs = picks.filter((p) => p.reference);
  const total = picks.reduce((n, p) => n + p.file.size, 0);
  const progress = picks.length ? Math.round(picks.reduce((n, p) => n + p.progress * p.file.size, 0) / Math.max(1, total)) : 0;
  const wsIdeas = ideas.filter((i) => i.workspace_id === target?.id);
  const kitWsId = kitFrom === "auto" ? target?.id : kitFrom === "none" ? null : kitFrom;
  const kit = kits.find((k) => k.workspace_id === kitWsId);
  const kitsWithItems = kits.filter((k) => k.items > 0);
  const postTo = platforms ?? (forClient ? (target?.allowed_platforms ?? []).filter((p) => ["instagram", "tiktok", "facebook"].includes(p)) : []);

  const add = (list: FileList | File[] | null, reference: boolean) => {
    if (!list) return;
    const next = Array.from(list).map((file) => ({ id: crypto.randomUUID(), file, reference, progress: 0 }));
    if (next.length) haptic("select");
    setPicks((cur) => [...cur, ...next]);
  };
  const toggleColor = (c: string) => setColors((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c].slice(0, 8)));

  async function pasteLink() {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (/^https?:\/\//i.test(text)) setLinks((cur) => (cur ? `${cur}\n${text}` : text));
      else setError("The clipboard doesn't have a link. Copy the reel or video link first.");
    } catch {
      setError("Paste the link into the box below instead.");
    }
  }

  async function start() {
    if (!target) return setError("No workspace found.");
    if (!footage.some((p) => !isImage(p.file))) return setError("Add at least one video.");
    setBusy(true);
    setError(null);
    const title = (idea?.hook || footage[0].file.name.replace(/\.[^.]+$/, "") || "Video").slice(0, 120);
    const kind = (p: Pick): MediaKind => (p.reference ? (isImage(p.file) ? "reference_image" : "reference_video") : isImage(p.file) ? "photo" : "video");
    const firstVideo = footage.find((p) => !isImage(p.file))!;
    const prepared = await prepareUpload({
      workspaceId: target.id,
      mode: "job",
      job: {
        title,
        form,
        platforms: forClient ? postTo : [],
        quick: !forClient,
        scriptId: idea?.id ?? null,
        useBrandKit: kitFrom !== "none",
        styleChoices: {
          colors: colors.length ? colors : undefined,
          brand_from: kitFrom !== "auto" && kitFrom !== "none" ? kitFrom : undefined,
          caption_preset_id: captions !== "auto" ? captions : undefined,
          voice_polish: voicePolish,
          face_track: faceTrack,
        },
      },
      files: picks.map((p) => ({ name: p.file.name, size: p.file.size, type: p.file.type, kind: kind(p), role: p.reference ? "reference" : p.id === firstVideo.id ? "primary" : "source" })),
      links: links.split(/\s+/).filter(Boolean),
      note: wish,
    });
    if (prepared.error || !prepared.uploads) {
      setBusy(false);
      haptic("error");
      return setError(prepared.error ?? "Couldn't start the upload.");
    }
    const uploaded: string[] = [];
    const failed: string[] = [];
    const queue = prepared.uploads.map((u, i) => ({ ...u, pick: picks[i] }));
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const job = next;
        const ok = await put(job.url, job.pick.file, (p) => setPicks((cur) => cur.map((x) => (x.id === job.pick.id ? { ...x, progress: p } : x))));
        (ok ? uploaded : failed).push(job.mediaId);
      }
    };
    await Promise.all([worker(), worker()]);
    const done = await completeUpload({ workspaceId: target.id, jobId: prepared.jobId ?? null, group: prepared.group!, uploaded, failed, startNow: true });
    if (done.error || done.missing) {
      setBusy(false);
      haptic("error");
      return setError(done.error ?? `${done.missing} file(s) didn't finish uploading. Try again.`);
    }
    haptic("success");
    router.push(`/jobs/${prepared.jobId}`);
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      <input ref={pickInput} type="file" multiple accept="image/*,video/*" className="sr-only" onChange={(e) => { add(e.target.files, false); e.target.value = ""; }} />
      <input ref={filesInput} type="file" multiple accept="video/*,image/*,.mov,.mp4,.mts,.mxf" className="sr-only" onChange={(e) => { add(e.target.files, false); e.target.value = ""; }} />
      <input ref={refInput} type="file" multiple accept="video/*,image/*" className="sr-only" onChange={(e) => { add(e.target.files, true); e.target.value = ""; }} />

      {/* Who it's for */}
      <div>
        <Label>For</Label>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
          {[{ id: JUST_ME, name: "Just me" }, ...workspaces.filter((w) => !w.is_agency)].map((w) => (
            <button
              key={w.id}
              type="button"
              disabled={busy}
              onClick={() => {
                setForId(w.id);
                setIdeaId("");
                setPlatforms(null);
                setKitFrom("auto");
                setColors([]);
              }}
              className={`press shrink-0 rounded-full px-4 py-2 text-sm ${forId === w.id ? "bg-bone font-semibold text-ink" : "border border-rule text-mist"}`}
            >
              {w.name}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-ash">{forClient ? `Edited in ${target?.name}'s style, then follows their posting rules.` : "Not posted anywhere. Download or save it when it's done."}</p>
      </div>

      {/* Idea (optional), inline, no pop-up */}
      {wsIdeas.length ? (
        <div>
          <Label hint="optional">From an idea</Label>
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
            {wsIdeas.slice(0, 15).map((i) => (
              <button key={i.id} type="button" disabled={busy} onClick={() => { setIdeaId(ideaId === i.id ? "" : i.id); setForm(i.form); }} className={`press max-w-[16rem] shrink-0 truncate rounded-2xl px-3.5 py-2 text-left text-sm ${ideaId === i.id ? "bg-bone font-semibold text-ink" : "border border-rule text-mist"}`}>
                {i.hook}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Footage */}
      <div>
        <Label>Footage</Label>
        {footage.length ? (
          <div className="rise-in grid gap-2">
            {footage.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-2xl border border-rule bg-char px-3 py-2.5">
                <Icon name={isImage(p.file) ? "image" : "film"} className="size-5 shrink-0 text-mist" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{p.file.name}</span>
                  <span className="tabular block text-xs text-ash">{mb(p.file.size)}{busy ? ` · ${p.progress}%` : ""}</span>
                </span>
                {!busy ? (
                  <button type="button" aria-label={`Remove ${p.file.name}`} onClick={() => setPicks((cur) => cur.filter((x) => x.id !== p.id))} className="press grid size-8 place-items-center rounded-full text-ash">
                    <Icon name="x" className="size-4" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        <div className={`grid grid-cols-4 gap-2 ${footage.length ? "mt-2" : ""}`}>
          <button type="button" disabled={busy} onClick={() => pickInput.current?.click()} className={`press col-span-4 flex flex-col items-center justify-center gap-1.5 rounded-[28px] ${footage.length ? "h-12 border border-rule-strong text-sm" : "min-h-28 bg-bone text-ink"}`}>
            {footage.length ? "+ Add more" : (<><Icon name="film" className="size-7" /><span className="text-lg font-semibold">Choose from gallery</span><span className="text-xs opacity-60">Photos, Google Photos</span></>)}
          </button>
          <button type="button" disabled={busy} onClick={() => setPrompter(true)} className="press col-span-2 flex h-16 flex-col items-center justify-center gap-1 rounded-2xl border border-rule-strong text-xs text-mist"><Icon name="note" className="size-5" /> Record{idea ? " this idea" : ""}</button>
          <button type="button" disabled={busy} onClick={() => filesInput.current?.click()} className="press flex h-16 flex-col items-center justify-center gap-1 rounded-2xl border border-rule-strong text-xs text-mist"><Icon name="upload" className="size-5" /> Files</button>
          <button type="button" disabled={busy} onClick={() => setCardOpen(true)} className="press flex h-16 flex-col items-center justify-center gap-1 rounded-2xl border border-rule-strong text-xs text-mist"><Icon name="sdcard" className="size-5" /> SD card</button>
        </div>
      </div>

      {/* Format */}
      <div className="grid grid-cols-2 gap-1 rounded-full border border-rule p-1 text-sm">
        {(["short", "long"] as const).map((f) => (
          <button key={f} type="button" disabled={busy} onClick={() => setForm(f)} className={`press h-10 rounded-full ${form === f ? "bg-bone font-semibold text-ink" : "text-mist"}`}>
            {f === "short" ? "Short · 9:16" : "Long · 16:9"}
          </button>
        ))}
      </div>

      {/* Look */}
      <div>
        <Label hint="optional">What should it look like?</Label>
        <textarea value={wish} onChange={(e) => setWish(e.target.value)} disabled={busy} placeholder="e.g. Fast cuts, bold yellow captions, whoosh on every cut, end on the logo" className="field min-h-20" maxLength={4000} />
        <div className="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-1">
          {LOOKS.map((l) => (
            <button
              key={l.label}
              type="button"
              disabled={busy}
              onClick={() => setWish((cur) => (cur.includes(l.text) ? cur : `${cur}${cur.trim() ? ". " : ""}${l.text}`))}
              className="press shrink-0 rounded-full border border-rule px-3 py-1.5 text-xs text-mist"
            >
              + {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Captions */}
      <div>
        <Label hint="tap to preview">Captions</Label>
        <CaptionPicker value={captions} onChange={setCaptions} forClient={forClient} />
      </div>

      {/* Extras */}
      <div className="grid gap-2">
        {[
          { on: voicePolish, set: setVoicePolish, title: "Clean up my voice", body: "Removes noise and echo, evens the level: crisp, studio-like." },
          { on: faceTrack, set: setFaceTrack, title: "Face tracking zooms", body: "Keeps your face centered and punches in on key moments, CapCut-style." },
        ].map((x) => (
          <button key={x.title} type="button" role="switch" aria-checked={x.on} disabled={busy} onClick={() => x.set(!x.on)} className="press flex items-center gap-3 rounded-2xl border border-rule px-4 py-3 text-left">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{x.title}</span>
              <span className="block text-xs text-ash">{x.body}</span>
            </span>
            <span aria-hidden className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${x.on ? "bg-bone" : "bg-graphite"}`}>
              <span className={`absolute top-1 size-5 rounded-full transition-all ${x.on ? "left-6 bg-ink" : "left-1 bg-ash"}`} />
            </span>
          </button>
        ))}
      </div>

      {/* Branding */}
      <div className="rounded-3xl border border-rule p-4">
        <Label hint="optional">Branding</Label>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
          {[
            { id: "auto", name: `${forClient ? `${target?.name}'s kit` : `${agency?.name ?? "Your"} kit`}${kits.find((k) => k.workspace_id === target?.id)?.items ? "" : " (empty)"}` },
            ...kitsWithItems.filter((k) => k.workspace_id !== target?.id).map((k) => ({ id: k.workspace_id, name: `${workspaces.find((w) => w.id === k.workspace_id)?.name ?? "Brand"} kit` })),
            { id: "none", name: "No branding" },
          ].map((o) => (
            <button key={o.id} type="button" disabled={busy} onClick={() => { setKitFrom(o.id); setColors([]); }} className={`press shrink-0 rounded-full px-3.5 py-1.5 text-sm ${kitFrom === o.id ? "bg-bone font-semibold text-ink" : "border border-rule text-mist"}`}>
              {o.name}
            </button>
          ))}
        </div>
        {kitFrom !== "none" ? (
          <>
            <p className="mb-2 mt-3 text-xs text-ash">
              {kit?.items ? "Logo, fonts and the rest of the kit are used. Tap colors to use exactly those:" : (
                <>No brand kit yet (no logo or colors saved). <Link href={`/clients/${kitWsId}?tab=brand`} className="text-mist underline underline-offset-4">Set one up</Link>, or just pick colors for this video:</>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {(kit?.colors ?? []).map((c) => (
                <button key={c} type="button" aria-pressed={colors.includes(c)} aria-label={`Color ${c}`} onClick={() => toggleColor(c)} className={`press grid size-10 place-items-center rounded-full border-2 ${colors.includes(c) ? "border-bone" : "border-transparent"}`} style={{ background: c }}>
                  {colors.includes(c) ? <Icon name="check" className="size-4 text-bone mix-blend-difference" stroke={3} /> : null}
                </button>
              ))}
              {colors.filter((c) => !(kit?.colors ?? []).includes(c)).map((c) => (
                <button key={c} type="button" aria-label={`Remove ${c}`} onClick={() => toggleColor(c)} className="press grid size-10 place-items-center rounded-full border-2 border-bone" style={{ background: c }}>
                  <Icon name="check" className="size-4 text-bone mix-blend-difference" stroke={3} />
                </button>
              ))}
              <label className="press flex h-10 items-center gap-2 rounded-full border border-dashed border-rule-strong pl-1.5 pr-3 text-xs text-mist">
                <input type="color" value={customColor} onChange={(e) => setCustomColor(e.target.value)} className="size-7 cursor-pointer rounded-full border-0 bg-transparent p-0" aria-label="Pick a color" />
                <button type="button" onClick={() => toggleColor(customColor.toLowerCase())}>Add color</button>
              </label>
            </div>
          </>
        ) : null}
      </div>

      {/* References */}
      <div className="rounded-3xl border border-rule p-4">
        <Label hint="optional">References</Label>
        <p className="-mt-1 text-xs text-ash">A reel you want it to look like. The editor downloads and copies its style.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" disabled={busy} onClick={pasteLink} className="press flex h-11 items-center justify-center gap-2 rounded-full border border-rule-strong text-sm"><Icon name="link" className="size-4" /> Paste link</button>
          <button type="button" disabled={busy} onClick={() => refInput.current?.click()} className="press flex h-11 items-center justify-center gap-2 rounded-full border border-rule-strong text-sm"><Icon name="image" className="size-4" /> Photo or video</button>
        </div>
        {links || refs.length ? (
          <div className="mt-3 grid gap-2">
            {refs.map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-sm text-mist">
                <Icon name={isImage(p.file) ? "image" : "film"} className="size-4" />
                <span className="min-w-0 flex-1 truncate">{p.file.name}</span>
                {!busy ? <button type="button" aria-label="Remove reference" onClick={() => setPicks((cur) => cur.filter((x) => x.id !== p.id))} className="press text-ash"><Icon name="x" className="size-4" /></button> : null}
              </div>
            ))}
            <textarea value={links} onChange={(e) => setLinks(e.target.value)} disabled={busy} placeholder="Links, one per line" className="field min-h-16 text-sm" inputMode="url" />
          </div>
        ) : null}
      </div>

      {/* Posting (clients only) */}
      {forClient && (target?.allowed_platforms ?? []).length ? (
        <div>
          <Label>Post to</Label>
          <div className="flex flex-wrap gap-2">
            {(target?.allowed_platforms ?? []).map((p) => (
              <button key={p} type="button" disabled={busy} onClick={() => setPlatforms(postTo.includes(p) ? postTo.filter((x) => x !== p) : [...postTo, p])} className={`chip press ${postTo.includes(p) ? "!border-bone !bg-bone !text-ink" : ""}`}>
                {PLATFORM_LABEL[p as Platform] ?? p}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {error ? <p role="alert" className="text-center text-sm text-danger">{error}</p> : null}

      <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-10 md:bottom-4">
        <button type="button" disabled={busy || !footage.length} onClick={start} className="press relative flex h-16 w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-bone text-lg font-semibold text-ink shadow-[0_20px_40px_-20px_rgb(0_0_0)] disabled:opacity-40">
          {busy ? <span aria-hidden className="absolute inset-y-0 left-0 bg-ink/10 transition-[width] duration-300" style={{ width: `${progress}%` }} /> : null}
          <Icon name="spark" className="relative size-5" />
          <span className="relative">{busy ? (progress < 100 ? `Uploading ${progress}%` : "Starting the edit…") : "Edit it"}</span>
        </button>
      </div>
      <p className="-mt-3 text-center text-xs text-ash">
        Need more control (style presets, posting time, due date)? <Link href={forClient ? `/upload?ws=${target?.id}` : "/upload"} className="text-mist underline underline-offset-4">All options</Link>
      </p>

      <CardImport open={cardOpen} onClose={() => setCardOpen(false)} onImport={(files) => add(files, false)} />
      {prompter ? (
        <Teleprompter
          scripts={wsIdeas.map((i) => ({ id: i.id, label: i.hook, text: [i.hook, i.script, i.outline].filter(Boolean).join("\n\n") }))}
          initialScriptId={idea?.id ?? null}
          form={form}
          onDone={(file) => {
            add([file], false);
            setPrompter(false);
          }}
          onClose={() => setPrompter(false)}
        />
      ) : null}
    </div>
  );
}
