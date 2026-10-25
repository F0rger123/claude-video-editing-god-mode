"use client";

import { AGENCY_NAME } from "@/lib/brand";
import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { completeUpload, prepareUpload, type UploadFileSpec } from "@/app/actions/upload";
import { Icon, type IconName } from "@/components/icons";
import { MEDIA_KIND_LABEL, PLATFORM_LABEL, type MediaKind, type Platform, type PostTiming } from "@/lib/domain/types";
import { formatBytes, formatDuration } from "@/lib/format";
import { Teleprompter } from "@/components/teleprompter";
import { CAMERA_PHOTO, CAMERA_VIDEO, CardImport } from "@/components/card-import";

type Item = { id: string; file: File; kind: MediaKind; role: UploadFileSpec["role"]; duration: number | null; progress: number; state: "ready" | "uploading" | "done" | "failed"; preview: string | null };
export type PresetOption = { id: string; kind: "captions" | "sound" | "edit"; name: string; instructions: string | null; is_default: boolean };
export type ScriptOption = { id: string; hook: string; form: "short" | "long"; script?: string | null; outline?: string | null };
export type LibraryOption = { id: string; name: string; kind: string; notes: string | null; workspace_id: string | null };
export type ProjectOption = { id: string; workspace_id: string; name: string };
/** A client's brand kit at a glance: main logo (signed preview URL), colors, number of items. */
export type BrandKitSummary = { workspace_id: string; logo: string | null; colors: string[]; items: number };
type WorkspaceOption = { id: string; name: string; allowed_platforms: string[] };

const KIND_ICON: Partial<Record<MediaKind, IconName>> = { video: "film", broll: "layers", photo: "image", audio: "audio", logo: "image", reference_video: "film", reference_image: "image" };
// Camera files often have no MIME type (MTS, MXF, RAW photos), so the extension decides too.
const isImage = (f: File) => f.type.startsWith("image/") || (CAMERA_PHOTO.test(f.name) && !CAMERA_VIDEO.test(f.name));
const guessKind = (f: File, reference: boolean): MediaKind =>
  reference ? (isImage(f) ? "reference_image" : "reference_video") : isImage(f) ? "photo" : f.type.startsWith("audio/") ? "audio" : "video";

function readDuration(file: File): Promise<number | null> {
  if (!file.type.startsWith("video/") && !file.type.startsWith("audio/")) return Promise.resolve(null);
  return new Promise((resolve) => {
    const el = document.createElement(file.type.startsWith("audio/") ? "audio" : "video");
    el.preload = "metadata";
    const url = URL.createObjectURL(file);
    const done = (v: number | null) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? el.duration : null);
    el.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    el.src = url;
  });
}

function putWithProgress(url: string, file: File, onProgress: (p: number) => void): Promise<boolean> {
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

function Panel({ children }: { children: ReactNode }) {
  return <div className="grid gap-5">{children}</div>;
}

function Choice({ on, onClick, title, body, icon }: { on: boolean; onClick: () => void; title: string; body?: string; icon?: IconName }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={`press flex w-full items-start gap-3 rounded-2xl border p-4 text-left ${on ? "border-bone bg-graphite" : "border-rule hover:border-rule-strong"}`}>
      {icon ? <Icon name={icon} className="mt-0.5 size-5 shrink-0" /> : null}
      <span>
        <span className="block font-semibold">{title}</span>
        {body ? <span className="block text-sm text-ash">{body}</span> : null}
      </span>
    </button>
  );
}

function FileList({ items, busy, onRemove, onKind, onPrimary, kinds }: { items: Item[]; busy: boolean; onRemove: (id: string) => void; onKind: (id: string, k: MediaKind) => void; onPrimary?: (id: string) => void; kinds: MediaKind[] }) {
  if (!items.length) return null;
  return (
    <ul className="grid gap-2">
      {items.map((i) => (
        <li key={i.id} className="rounded-2xl border border-rule bg-coal p-3">
          <div className="flex items-center gap-3">
            <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-graphite">
              {i.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={i.preview} alt="" className="size-full object-cover" />
              ) : (
                <Icon name={KIND_ICON[i.kind] ?? "film"} className="size-5 text-mist" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{i.file.name}</p>
              <p className="tabular text-xs text-ash">
                {formatBytes(i.file.size)}
                {i.duration ? ` · ${formatDuration(i.duration)}` : ""}
                {i.role === "primary" ? " · main take" : ""}
              </p>
            </div>
            {i.state === "done" ? <Icon name="check" className="size-5 text-success" /> : i.state === "failed" ? <Icon name="alert" className="size-5 text-danger" /> : !busy ? (
              <button type="button" aria-label={`Remove ${i.file.name}`} onClick={() => onRemove(i.id)} className="press grid size-9 place-items-center rounded-full text-ash hover:text-bone">
                <Icon name="x" className="size-4" />
              </button>
            ) : null}
          </div>
          {i.state === "uploading" || i.state === "done" ? (
            <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-graphite">
              <div className={`progress h-full ${i.state === "done" ? "bg-success" : "bg-bone"}`} style={{ width: `${i.progress}%` }} />
            </div>
          ) : !busy ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <select aria-label="File type" value={i.kind} onChange={(e) => onKind(i.id, e.target.value as MediaKind)} className="h-8 rounded-full border border-rule bg-char px-3 text-xs">
                {kinds.map((k) => <option key={k} value={k}>{MEDIA_KIND_LABEL[k]}</option>)}
              </select>
              {onPrimary && i.kind === "video" ? (
                <button type="button" onClick={() => onPrimary(i.id)} className={`press h-8 rounded-full border px-3 text-xs ${i.role === "primary" ? "border-bone bg-bone text-ink" : "border-rule text-mist"}`}>
                  {i.role === "primary" ? "Main take" : "Make main take"}
                </button>
              ) : null}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function StylePick({ label, kind, presets, value, onChange }: { label: string; kind: PresetOption["kind"]; presets: PresetOption[]; value: string; onChange: (v: string) => void }) {
  const list = presets.filter((p) => p.kind === kind);
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{label}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onChange("auto")} className={`chip press ${value === "auto" ? "!border-bone !bg-bone !text-ink" : ""}`}>Let Claude decide</button>
        {list.map((p) => (
          <button key={p.id} type="button" title={p.instructions ?? undefined} onClick={() => onChange(p.id)} className={`chip press ${value === p.id ? "!border-bone !bg-bone !text-ink" : ""}`}>
            {p.name}
          </button>
        ))}
      </div>
      {list.find((p) => p.id === value)?.instructions ? <p className="mt-2 text-xs text-ash">{list.find((p) => p.id === value)!.instructions}</p> : null}
    </div>
  );
}

/**
 * Upload wizard, shared by the agency and client portals. One screen per decision:
 * what → footage → references → style → posting (staff) → check & upload.
 * Many files → ONE intended video; "Sort later" sends a loose batch to the inbox instead.
 */
export function UploadComposer({
  workspaces,
  fixedWorkspaceId,
  allowedPlatforms,
  staff,
  existingJob,
  jobHrefPrefix,
  looseHref,
  presets = [],
  scripts = [],
  initialScriptId,
  presetTarget,
  library = [],
  initialRecord = false,
  projects = [],
  kits = [],
}: {
  workspaces?: WorkspaceOption[];
  fixedWorkspaceId?: string;
  allowedPlatforms?: string[];
  staff: boolean;
  existingJob?: { id: string; title: string } | null;
  /** Where to go after upload: `${jobHrefPrefix}${jobId}` or looseHref (props must be serialisable). */
  jobHrefPrefix: string;
  looseHref: string;
  presets?: (PresetOption & { workspace_id: string })[];
  scripts?: (ScriptOption & { workspace_id: string })[];
  initialScriptId?: string | null;
  /** Upload reference files into a style preset instead of a video. */
  presetTarget?: { id: string; name: string } | null;
  /** Staff only: library items that can be picked per video. */
  library?: LibraryOption[];
  /** Open the teleprompter right away (from an idea's "Record it"). */
  initialRecord?: boolean;
  projects?: ProjectOption[];
  kits?: BrandKitSummary[];
}) {
  const router = useRouter();
  const footageInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const refInput = useRef<HTMLInputElement>(null);
  const photosInput = useRef<HTMLInputElement>(null);
  const [workspaceId, setWorkspaceId] = useState(fixedWorkspaceId ?? workspaces?.[0]?.id ?? "");
  const [mode, setMode] = useState<"job" | "loose">("job");
  const initialScript = scripts.find((s) => s.id === initialScriptId);
  const [scriptId, setScriptId] = useState<string>(initialScript?.id ?? "");
  const [title, setTitle] = useState(initialScript?.hook.slice(0, 160) ?? "");
  const [form, setForm] = useState<"short" | "long">(initialScript?.form ?? "short");
  const platformsFor = allowedPlatforms ?? workspaces?.find((w) => w.id === workspaceId)?.allowed_platforms ?? [];
  const [platforms, setPlatforms] = useState<string[]>(platformsFor.filter((p) => p === "instagram" || p === "tiktok" || p === "facebook"));
  const [items, setItems] = useState<Item[]>([]);
  const [links, setLinks] = useState("");
  const [note, setNote] = useState("");
  const wsPresets = presets.filter((p) => p.workspace_id === workspaceId);
  const defaultOf = (k: PresetOption["kind"]) => wsPresets.find((p) => p.kind === k && p.is_default)?.id ?? "auto";
  const [style, setStyle] = useState({ captions: defaultOf("captions"), sound: defaultOf("sound"), edit: defaultOf("edit") });
  const [styleNotes, setStyleNotes] = useState("");
  const [materials, setMaterials] = useState<string[]>([]);
  const [projectId, setProjectId] = useState("");
  const [useBrandKit, setUseBrandKit] = useState(true);
  const [cardOpen, setCardOpen] = useState(false);
  const wsProjects = projects.filter((p) => p.workspace_id === workspaceId);
  const kit = kits.find((k) => k.workspace_id === workspaceId);
  const wsLibrary = library.filter((l) => !l.workspace_id || l.workspace_id === workspaceId);
  const [timing, setTiming] = useState<PostTiming | "default">("default");
  const [postAt, setPostAt] = useState("");
  const [review, setReview] = useState(false);
  const [priority, setPriority] = useState("normal");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ error?: string; ok?: string } | null>(null);

  const simple = Boolean(existingJob || presetTarget);
  const steps: { key: string; title: string }[] = simple
    ? [{ key: "footage", title: presetTarget ? `References for “${presetTarget.name}”` : "Add files" }, { key: "check", title: "Check & upload" }]
    : mode === "loose"
      ? [{ key: "what", title: "What are you uploading?" }, { key: "footage", title: "Footage" }, { key: "check", title: "Check & upload" }]
      : [
          { key: "what", title: "What are you making?" },
          { key: "footage", title: "Footage" },
          { key: "references", title: "References" },
          { key: "style", title: "Style" },
          ...(staff ? [{ key: "posting", title: "Posting" }] : []),
          { key: "check", title: "Check & upload" },
        ];
  const [stepIndex, setStepIndex] = useState(initialRecord && initialScript ? 1 : 0);
  const [prompter, setPrompter] = useState(initialRecord && Boolean(initialScript));
  const prompterScripts = scripts
    .filter((s) => s.workspace_id === workspaceId)
    .map((s) => ({ id: s.id, label: s.hook, text: [s.hook, s.script, s.outline].filter(Boolean).join("\n\n") }));
  const step = steps[Math.min(stepIndex, steps.length - 1)].key;
  const footage = items.filter((i) => !i.kind.startsWith("reference"));
  const references = items.filter((i) => i.kind.startsWith("reference"));

  async function addFiles(list: FileList | File[] | null, reference: boolean) {
    if (!list) return;
    const next: Item[] = [];
    for (const file of Array.from(list)) {
      next.push({ id: crypto.randomUUID(), file, kind: guessKind(file, reference || Boolean(presetTarget)), role: reference ? "reference" : "source", duration: await readDuration(file), progress: 0, state: "ready", preview: file.type.startsWith("image/") && !/\.(dng|arw|cr2|cr3|nef|raf|orf|rw2)$/i.test(file.name) ? URL.createObjectURL(file) : null });
    }
    setItems((cur) => {
      const merged = [...cur, ...next];
      if (!simple && !merged.some((i) => i.role === "primary")) {
        const firstVideo = merged.find((i) => i.kind === "video");
        if (firstVideo) firstVideo.role = "primary";
      }
      return merged;
    });
  }
  const update = (id: string, patch: Partial<Item>) => setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const setPrimary = (id: string) => setItems((cur) => cur.map((i) => ({ ...i, role: i.id === id ? "primary" : i.role === "primary" ? "source" : i.role })));
  const remove = (id: string) => setItems((cur) => cur.filter((x) => x.id !== id));

  const blocker =
    step === "what" && !workspaceId ? "Choose a client." :
    step === "footage" && !simple && mode === "job" && !footage.some((i) => i.kind === "video") ? "Add at least one video clip (you can add references next)." :
    step === "posting" && timing === "fixed" && !postAt ? "Pick the posting time." : null;

  async function submit() {
    setBusy(true);
    setResult(null);
    const prepared = await prepareUpload({
      workspaceId,
      mode: simple ? "loose" : mode,
      existingJobId: existingJob?.id ?? null,
      presetId: presetTarget?.id ?? null,
      job:
        mode === "job" && !simple
          ? {
              title,
              form,
              platforms,
              priority,
              dueDate: due || null,
              requireReview: review,
              scriptId: scriptId || null,
              styleChoices: { ...style, notes: styleNotes || undefined, materials: materials.length ? materials : undefined },
              projectId: projectId || null,
              useBrandKit,
              postTiming: timing === "default" ? null : timing,
              postAt: timing === "fixed" && postAt ? new Date(postAt).toISOString() : null,
            }
          : undefined,
      files: items.map((i) => ({ name: i.file.name, size: i.file.size, type: i.file.type, kind: i.kind, role: i.role, duration: i.duration })),
      links: links.split(/\s+/).filter(Boolean),
      note,
    });
    if (prepared.error || !prepared.uploads) {
      setBusy(false);
      return setResult({ error: prepared.error ?? "Upload could not start." });
    }
    const uploaded: string[] = [];
    const failed: string[] = [];
    const queue = prepared.uploads.map((u, idx) => ({ ...u, item: items[idx] }));
    // Two at a time: fast on Wi-Fi, gentle on mobile data.
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const job = next;
        update(job.item.id, { state: "uploading" });
        const ok = await putWithProgress(job.url, job.item.file, (p) => update(job.item.id, { progress: p }));
        update(job.item.id, { state: ok ? "done" : "failed", progress: ok ? 100 : job.item.progress });
        (ok ? uploaded : failed).push(job.mediaId);
      }
    };
    await Promise.all([worker(), worker()]);
    const done = await completeUpload({ workspaceId, jobId: prepared.jobId ?? null, group: prepared.group!, uploaded, failed });
    setBusy(false);
    if (done.error) return setResult({ error: done.error });
    if (done.missing) return setResult({ error: `${done.missing} file(s) did not finish uploading. Upload them again.` });
    const what =
      done.status === "queued" ? "Uploaded. Editing has started." : done.status === "pending_approval" ? (staff ? `Uploaded. Waiting for approval: ${done.reasons?.join(" ") ?? ""}` : `Uploaded. ${AGENCY_NAME} will take it from here.`) : "Uploaded.";
    setResult({ ok: what });
    setTimeout(() => router.push(prepared.jobId ? `${jobHrefPrefix}${prepared.jobId}` : looseHref), 900);
  }

  const wsName = workspaces?.find((w) => w.id === workspaceId)?.name;
  const presetName = (id: string) => (id === "auto" ? "Claude decides" : wsPresets.find((p) => p.id === id)?.name ?? "Claude decides");

  return (
    <div>
      <ol className="mb-5 flex gap-1.5" aria-label="Steps">
        {steps.map((s, i) => (
          <li key={s.key} className={`h-1 flex-1 rounded-full ${i <= stepIndex ? "bg-bone" : "bg-graphite"}`} aria-current={i === stepIndex ? "step" : undefined}>
            <span className="sr-only">{s.title}</span>
          </li>
        ))}
      </ol>
      <p className="t-label mb-1">Step {stepIndex + 1} of {steps.length}</p>
      <h2 className="t-title mb-5">{steps[stepIndex].title}</h2>

      {/* Photos & videos only: Android opens the photo picker (Google Photos, incl. cloud items), iPhone the Photos library. */}
      <input ref={photosInput} type="file" multiple accept="image/*,video/*" className="sr-only" onChange={(e) => { void addFiles(e.target.files, false); e.target.value = ""; }} />
      {/* Any file (Files app, Drive, Downloads, audio). */}
      <input ref={footageInput} type="file" multiple accept="video/*,image/*,audio/*,.mov,.mp4,.m4a,.wav,.mp3" className="sr-only" onChange={(e) => { void addFiles(e.target.files, false); e.target.value = ""; }} />
      <input ref={cameraInput} type="file" accept="video/*" capture="environment" className="sr-only" onChange={(e) => { void addFiles(e.target.files, false); e.target.value = ""; }} />
      <input ref={refInput} type="file" multiple accept="video/*,image/*" className="sr-only" onChange={(e) => { void addFiles(e.target.files, true); e.target.value = ""; }} />

      {step === "what" ? (
        <Panel>
          {workspaces && !fixedWorkspaceId ? (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Client</span>
              <select value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} className="field">
                {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
          ) : null}
          {staff ? (
            <div className="grid grid-cols-2 gap-2">
              <Choice on={mode === "job"} onClick={() => setMode("job")} title="One video" body="All files make one edit" icon="film" />
              <Choice on={mode === "loose"} onClick={() => setMode("loose")} title="Sort later" body="Drop clips in the inbox" icon="inbox" />
            </div>
          ) : null}
          {mode === "job" ? (
            <>
              {scripts.filter((s) => s.workspace_id === workspaceId).length ? (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">Recorded from a script?</span>
                  <select value={scriptId} onChange={(e) => { setScriptId(e.target.value); const s = scripts.find((x) => x.id === e.target.value); if (s) { setTitle(s.hook.slice(0, 160)); setForm(s.form); } }} className="field">
                    <option value="">No script</option>
                    {scripts.filter((s) => s.workspace_id === workspaceId).map((s) => <option key={s.id} value={s.id}>{s.hook.slice(0, 80)}</option>)}
                  </select>
                </label>
              ) : null}
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">What is this video?</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Kitchen remodel before & after" className="field" maxLength={160} />
              </label>
              {wsProjects.length ? (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">Project <span className="font-normal text-ash">optional</span></span>
                  <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="field">
                    <option value="">No project</option>
                    {wsProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <Choice on={form === "short"} onClick={() => setForm("short")} title="Short-form" body="9:16 reel, TikTok, Short" />
                <Choice on={form === "long"} onClick={() => setForm("long")} title="Long-form" body="16:9 YouTube video" />
              </div>
              {platformsFor.length ? (
                <div>
                  <span className="mb-2 block text-sm font-medium">Post to</span>
                  <div className="flex flex-wrap gap-2">
                    {platformsFor.map((p) => (
                      <label key={p}>
                        <input type="checkbox" className="sr-only" checked={platforms.includes(p)} onChange={(e) => setPlatforms((cur) => (e.target.checked ? [...cur, p] : cur.filter((x) => x !== p)))} />
                        <span className="chip press">{PLATFORM_LABEL[p as Platform] ?? p}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </Panel>
      ) : null}

      {step === "footage" ? (
        <Panel>
          {presetTarget ? null : (
            <p className="text-sm text-ash">{simple ? "New takes, replacement footage or extra B-roll." : "Every take, B-roll clip, product photo, logo or voiceover for this one video."}</p>
          )}
          {presetTarget ? (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => refInput.current?.click()} className="press flex min-h-28 flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-rule-strong text-mist hover:border-bone hover:text-bone">
                <Icon name="image" className="size-6" />
                <span className="font-medium text-bone">Photos & recordings</span>
              </button>
              <div className="grid content-center rounded-3xl border border-rule p-3 text-xs text-ash">Screenshots of captions you like, screen recordings of reels, or paste links below.</div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => photosInput.current?.click()} className="press col-span-2 flex min-h-24 items-center justify-center gap-3 rounded-3xl bg-bone text-ink">
                <Icon name="image" className="size-6" />
                <span className="text-left">
                  <span className="block font-semibold">Photos & videos</span>
                  <span className="block text-xs opacity-70">Google Photos, camera roll</span>
                </span>
              </button>
              <button type="button" onClick={() => footageInput.current?.click()} className="press flex h-20 flex-col items-center justify-center gap-1 rounded-2xl border border-rule-strong text-xs text-mist hover:border-bone hover:text-bone">
                <Icon name="upload" className="size-5" /> Files
              </button>
              <button type="button" onClick={() => cameraInput.current?.click()} className="press flex h-20 flex-col items-center justify-center gap-1 rounded-2xl border border-rule-strong text-xs text-mist hover:border-bone hover:text-bone">
                <Icon name="film" className="size-5" /> Camera
              </button>
              <button type="button" onClick={() => setCardOpen(true)} className="press flex h-20 flex-col items-center justify-center gap-1 rounded-2xl border border-rule-strong text-xs text-mist hover:border-bone hover:text-bone">
                <Icon name="sdcard" className="size-5" /> Camera card / USB
              </button>
              {!simple ? (
                <button type="button" onClick={() => setPrompter(true)} className="press flex h-20 flex-col items-center justify-center gap-1 rounded-2xl border border-rule-strong text-xs text-mist hover:border-bone hover:text-bone">
                  <Icon name="note" className="size-5" /> Teleprompter
                </button>
              ) : (
                <span />
              )}
            </div>
          )}
          <FileList items={presetTarget ? items : footage} busy={busy} onRemove={remove} onKind={(id, k) => update(id, { kind: k })} onPrimary={simple ? undefined : setPrimary} kinds={presetTarget ? ["reference_image", "reference_video"] : ["video", "broll", "photo", "audio", "logo", "reference_video", "reference_image"]} />
          {simple ? (
            <>
              <textarea value={links} onChange={(e) => setLinks(e.target.value)} placeholder="Reference links: Instagram, TikTok, YouTube (one per line)" className="field min-h-20" inputMode="url" />
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={presetTarget ? "What do you like about these?" : "Note (optional)"} className="field" maxLength={4000} />
            </>
          ) : null}
        </Panel>
      ) : null}

      {step === "references" ? (
        <Panel>
          <p className="text-sm text-ash">Optional. Show Claude what this video should feel like: screenshots, screen recordings, reference videos or links.</p>
          <button type="button" onClick={() => refInput.current?.click()} className="press flex min-h-24 items-center justify-center gap-2 rounded-3xl border border-dashed border-rule-strong text-mist hover:border-bone hover:text-bone">
            <Icon name="image" className="size-5" />
            <span className="font-medium text-bone">Add screenshots or recordings</span>
          </button>
          <FileList items={references} busy={busy} onRemove={remove} onKind={(id, k) => update(id, { kind: k })} kinds={["reference_image", "reference_video"]} />
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Reference links <span className="font-normal text-ash">Instagram, TikTok, YouTube</span></span>
            <textarea value={links} onChange={(e) => setLinks(e.target.value)} placeholder="One link per line" className="field min-h-20" inputMode="url" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">{staff ? "Notes for Claude" : "Notes"}</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={staff ? "Hook idea, what to cut, what to keep…" : "Anything we should know about this video?"} className="field" maxLength={4000} />
          </label>
        </Panel>
      ) : null}

      {step === "style" ? (
        <Panel>
          <button
            type="button"
            role="switch"
            aria-checked={useBrandKit && Boolean(kit?.items)}
            disabled={!kit?.items}
            onClick={() => setUseBrandKit(!useBrandKit)}
            className={`press flex items-center gap-3 rounded-3xl border p-3 text-left transition-colors disabled:opacity-60 ${useBrandKit && kit?.items ? "border-bone bg-char" : "border-rule"}`}
          >
            <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-rule bg-ink">
              {kit?.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={kit.logo} alt="" className="size-full object-contain p-1.5" />
              ) : (
                <Icon name="image" className="size-5 text-ash" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Use {wsName ?? "the"} brand kit</span>
              <span className="mt-1 flex items-center gap-1">
                {kit?.colors.length ? kit.colors.slice(0, 6).map((c) => <span key={c} className="size-3.5 rounded-full border border-rule-strong" style={{ background: c }} />) : null}
                <span className="ml-1 text-xs text-ash">{kit?.items ? `${kit.items} item${kit.items === 1 ? "" : "s"}: logo, colors, fonts…` : staff ? "No brand kit yet (Clients → Brand kit)" : "No brand kit yet"}</span>
              </span>
            </span>
            <span aria-hidden className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${useBrandKit && kit?.items ? "bg-bone" : "bg-graphite"}`}>
              <span className={`absolute top-1 size-5 rounded-full transition-all ${useBrandKit && kit?.items ? "left-6 bg-ink" : "left-1 bg-ash"}`} />
            </span>
          </button>
          <p className="text-sm text-ash">Pick a saved style for {wsName ?? "this client"}, or let Claude choose from the brand profile and its references.</p>
          <StylePick label="Captions" kind="captions" presets={wsPresets} value={style.captions} onChange={(v) => setStyle({ ...style, captions: v })} />
          <StylePick label="Sound effects" kind="sound" presets={wsPresets} value={style.sound} onChange={(v) => setStyle({ ...style, sound: v })} />
          <StylePick label="Editing style" kind="edit" presets={wsPresets} value={style.edit} onChange={(v) => setStyle({ ...style, edit: v })} />
          {wsLibrary.length ? (
            <div>
              <p className="mb-1 text-sm font-medium">Use these from the library <span className="font-normal text-ash">optional</span></p>
              <p className="mb-2 text-xs text-ash">Pick exact sound effects, film burns, LUTs or fonts. Nothing picked = Claude chooses from your library and packs.</p>
              {(["sfx", "overlay", "lut", "font", "caption", "music", "other", "reference"] as const).map((k) => {
                const list = wsLibrary.filter((l) => l.kind === k);
                if (!list.length) return null;
                return (
                  <div key={k} className="mb-3">
                    <p className="t-label mb-1.5">{{ sfx: "Sound effects", overlay: "Overlays", lut: "LUTs", font: "Fonts", caption: "Captions", music: "Music", other: "Other", reference: "References" }[k]}</p>
                    <div className="flex flex-wrap gap-2">
                      {list.map((l) => (
                        <button key={l.id} type="button" title={l.notes ?? undefined} onClick={() => setMaterials((cur) => (cur.includes(l.id) ? cur.filter((x) => x !== l.id) : [...cur, l.id]))} className={`chip press ${materials.includes(l.id) ? "!border-bone !bg-bone !text-ink" : ""}`}>
                          {l.name}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
          <textarea value={styleNotes} onChange={(e) => setStyleNotes(e.target.value)} placeholder="Anything special for this one? e.g. “Hit 01 on the reveal, film burn at 0:12”" className="field min-h-20" maxLength={1000} />
        </Panel>
      ) : null}

      {step === "posting" ? (
        <Panel>
          <Choice on={timing === "default"} onClick={() => setTiming("default")} title="Client's default" body="Whatever this client's settings say" icon="settings" />
          <Choice on={timing === "auto_slot"} onClick={() => setTiming("auto_slot")} title="Best open slot" body="Claude picks from the posting schedule" icon="calendar" />
          <Choice on={timing === "after_edit"} onClick={() => setTiming("after_edit")} title="Right after editing" body="Posts as soon as it is approved" icon="play" />
          <Choice on={timing === "fixed"} onClick={() => setTiming("fixed")} title="At a time I choose" body="For example tomorrow at 12:00" icon="clock" />
          {timing === "fixed" ? <input type="datetime-local" value={postAt} onChange={(e) => setPostAt(e.target.value)} className="field" /> : null}
          <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-rule px-4 text-sm">
            <input type="checkbox" checked={review} onChange={(e) => setReview(e.target.checked)} className="size-5 accent-bone" />
            Wait for my approval before it posts
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Priority</span>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} className="field">
                {["low", "normal", "high", "urgent"].map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Due</span>
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="field" />
            </label>
          </div>
        </Panel>
      ) : null}

      {step === "check" ? (
        <Panel>
          <dl className="grid gap-2 rounded-2xl border border-rule p-4 text-sm">
            {wsName ? <div className="flex justify-between gap-3"><dt className="text-ash">Client</dt><dd>{wsName}</dd></div> : null}
            {existingJob ? <div className="flex justify-between gap-3"><dt className="text-ash">Adding to</dt><dd className="truncate">{existingJob.title}</dd></div> : null}
            {mode === "job" && !simple ? (
              <>
                <div className="flex justify-between gap-3"><dt className="text-ash">Video</dt><dd className="truncate">{title || "Untitled"} · {form === "short" ? "Short" : "Long"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-ash">Post to</dt><dd>{platforms.map((p) => PLATFORM_LABEL[p as Platform] ?? p).join(", ") || "Not set"}</dd></div>
                {projectId ? <div className="flex justify-between gap-3"><dt className="text-ash">Project</dt><dd className="truncate">{wsProjects.find((p) => p.id === projectId)?.name}</dd></div> : null}
                <div className="flex justify-between gap-3"><dt className="text-ash">Brand kit</dt><dd>{kit?.items ? (useBrandKit ? "On" : "Off") : "None yet"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-ash">Style</dt><dd className="text-right">{presetName(style.captions)} · {presetName(style.sound)} · {presetName(style.edit)}{materials.length ? ` · ${materials.length} picked` : ""}</dd></div>
                {staff ? <div className="flex justify-between gap-3"><dt className="text-ash">Posting</dt><dd>{timing === "default" ? "Client default" : timing === "auto_slot" ? "Best slot" : timing === "after_edit" ? "After editing" : postAt.replace("T", " ")}{review ? " · needs my OK" : ""}</dd></div> : null}
              </>
            ) : null}
            <div className="flex justify-between gap-3"><dt className="text-ash">Files</dt><dd className="tabular">{items.length} · {formatBytes(items.reduce((n, i) => n + i.file.size, 0))}</dd></div>
            {links.trim() ? <div className="flex justify-between gap-3"><dt className="text-ash">Links</dt><dd>{links.split(/\s+/).filter(Boolean).length}</dd></div> : null}
          </dl>
          {busy || items.some((i) => i.state !== "ready") ? <FileList items={items} busy onRemove={remove} onKind={() => {}} kinds={[]} /> : null}
          {result?.error ? <p role="alert" className="text-sm text-danger">{result.error}</p> : null}
          {result?.ok ? <p role="status" className="text-sm text-success">{result.ok}</p> : null}
        </Panel>
      ) : null}

      <CardImport open={cardOpen} onClose={() => setCardOpen(false)} onImport={(files) => void addFiles(files, false)} />

      {prompter ? (
        <Teleprompter
          scripts={prompterScripts}
          initialScriptId={scriptId || null}
          form={form}
          onClose={() => setPrompter(false)}
          onDone={(file) => {
            const dt = new DataTransfer();
            dt.items.add(file);
            void addFiles(dt.files, false);
            setPrompter(false);
          }}
        />
      ) : null}

      <div className="pb-safe sticky bottom-16 z-20 -mx-4 mt-8 flex gap-2 bg-gradient-to-t from-ink via-ink/95 to-transparent px-4 pb-4 pt-6 md:bottom-0">
        {stepIndex > 0 ? (
          <button type="button" disabled={busy} onClick={() => setStepIndex(stepIndex - 1)} className="press h-14 rounded-full border border-rule-strong bg-ink px-6 text-sm font-semibold disabled:opacity-40">Back</button>
        ) : null}
        {step !== "check" ? (
          <button type="button" disabled={Boolean(blocker)} onClick={() => setStepIndex(stepIndex + 1)} className="press h-14 flex-1 rounded-full bg-bone text-base font-semibold text-ink shadow-[0_12px_40px_-12px_rgb(0_0_0)] disabled:opacity-40">
            {blocker ?? "Next"}
          </button>
        ) : (
          <button type="button" disabled={busy || !workspaceId || (!items.length && !links.trim() && !note.trim()) || Boolean(result?.ok)} onClick={submit} className="press h-14 flex-1 rounded-full bg-bone text-base font-semibold text-ink shadow-[0_12px_40px_-12px_rgb(0_0_0)] disabled:opacity-40">
            {busy ? "Uploading…" : presetTarget ? "Save references" : existingJob ? "Add files" : mode === "job" ? "Upload video" : "Upload to inbox"}
          </button>
        )}
      </div>
    </div>
  );
}
