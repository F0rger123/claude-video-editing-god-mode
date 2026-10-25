"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/form";
import { Icon, type IconName } from "@/components/icons";
import { Section } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { addBrandItem, finishBrandUpload, prepareBrandUpload, removeBrandAsset, saveProject, setPrimaryBrandAsset, type BrandKind } from "../brand-actions";

export type BrandAsset = {
  id: string;
  kind: BrandKind;
  name: string;
  notes: string | null;
  value: string | null;
  url: string | null;
  file_name: string | null;
  mime_type: string | null;
  is_primary: boolean;
  project_id: string | null;
  preview: string | null;
};
export type Project = { id: string; name: string; brief: string | null; status: string; videos: number };

/** Upload one or more files into the brand kit (or a project) with a small progress line. */
function UploadButton({ workspaceId, projectId, kind, accept, label, icon = "upload" }: { workspaceId: string; projectId?: string | null; kind: BrandKind; accept: string; label: string; icon?: IconName }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    const files = Array.from(list);
    setBusy(true);
    setStatus(`Uploading ${files.length}…`);
    const prepared = await prepareBrandUpload({ workspaceId, projectId: projectId ?? null, kind, files: files.map((f) => ({ name: f.name, size: f.size, type: f.type })) });
    if (prepared.error || !prepared.uploads) {
      setBusy(false);
      haptic("error");
      return setStatus(prepared.error ?? "Upload could not start.");
    }
    let done = 0;
    await Promise.all(
      prepared.uploads.map(async (u, i) => {
        await fetch(u.url, { method: "PUT", body: files[i], headers: { "Content-Type": files[i].type || "application/octet-stream" } }).catch(() => null);
        done++;
        setStatus(`Uploading ${done} of ${files.length}…`);
      }),
    );
    const r = await finishBrandUpload(workspaceId, prepared.uploads.map((u) => u.id));
    setBusy(false);
    if (r.error || r.missing) {
      haptic("error");
      setStatus(r.error ?? `${r.missing} file(s) didn't finish. Try again.`);
    } else {
      haptic("success");
      setStatus(null);
    }
    router.refresh();
  }

  return (
    <>
      <input ref={input} type="file" multiple accept={accept} className="sr-only" onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className="press flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-rule-strong px-4 text-sm text-mist hover:border-bone hover:text-bone disabled:opacity-60">
        <Icon name={icon} className={`size-4 ${busy ? "animate-pulse" : ""}`} /> {status ?? label}
      </button>
    </>
  );
}

function AssetMenu({ asset, canBeMain }: { asset: BrandAsset; canBeMain: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <span className="flex shrink-0 items-center gap-1">
      {canBeMain && !asset.is_primary ? (
        <button type="button" disabled={pending} onClick={() => start(async () => { await setPrimaryBrandAsset(asset.id); haptic("success"); router.refresh(); })} className="press h-8 rounded-full border border-rule px-2.5 text-xs text-mist">
          Make main
        </button>
      ) : null}
      <button type="button" disabled={pending} aria-label={`Remove ${asset.name}`} onClick={() => start(async () => { await removeBrandAsset(asset.id); haptic("warning"); router.refresh(); })} className="press grid size-8 place-items-center rounded-full border border-rule text-ash hover:text-danger">
        <Icon name="x" className="size-3.5" />
      </button>
    </span>
  );
}

function FileRows({ assets, canBeMain = false }: { assets: BrandAsset[]; canBeMain?: boolean }) {
  if (!assets.length) return null;
  return (
    <ul className="divide-y divide-rule rounded-2xl border border-rule">
      {assets.map((a) => (
        <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
          <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-graphite text-ash">
            {a.preview && a.mime_type?.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.preview} alt="" className="size-full object-contain" />
            ) : (
              <Icon name={a.url ? "link" : a.kind === "font" ? "note" : a.kind === "music" ? "audio" : a.kind === "photo" ? "image" : "film"} className="size-4" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">{a.name}</span>
            <span className="block truncate text-xs text-ash">{a.is_primary ? "Main · " : ""}{a.url ?? a.file_name ?? ""}</span>
          </span>
          <AssetMenu asset={a} canBeMain={canBeMain} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Brand kit for one client (or your own business): logos, watermark, colors, fonts, intro/outro,
 * music and reference videos. The editor gets all of it with every video that has "Use brand kit" on.
 */
export function BrandTab({ workspaceId, assets, name }: { workspaceId: string; assets: BrandAsset[]; name: string }) {
  const kit = assets.filter((a) => !a.project_id);
  const of = (...k: BrandKind[]) => kit.filter((a) => k.includes(a.kind));
  const logos = of("logo", "watermark");
  const colors = of("color");
  const primaryColor = colors.find((c) => c.is_primary)?.value ?? "#f4f4f2";
  const mainLogo = logos.find((l) => l.kind === "logo" && l.is_primary) ?? logos.find((l) => l.kind === "logo");

  return (
    <div>
      {/* Live preview: how the brand reads at a glance. */}
      <div className="rise-in mb-6 overflow-hidden rounded-[28px] border border-rule">
        <div className="relative flex h-36 items-end gap-4 p-5" style={{ background: `linear-gradient(135deg, ${primaryColor}33, transparent 70%), var(--color-char)` }}>
          <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-rule bg-ink">
            {mainLogo?.preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mainLogo.preview} alt={`${name} logo`} className="size-full object-contain p-2" />
            ) : (
              <Icon name="image" className="size-6 text-ash" />
            )}
          </span>
          <div className="min-w-0 pb-1">
            <p className="truncate text-xl font-semibold tracking-tight">{name}</p>
            <div className="mt-2 flex gap-1.5">
              {colors.length ? colors.slice(0, 8).map((c) => <span key={c.id} title={`${c.name} ${c.value}`} className="size-5 rounded-full border border-rule-strong" style={{ background: c.value ?? undefined }} />) : <span className="text-xs text-ash">No colors yet</span>}
            </div>
          </div>
        </div>
        <p className="border-t border-rule px-5 py-3 text-xs text-ash">The editor uses this kit on every {name} video with &ldquo;Use brand kit&rdquo; on (the default).</p>
      </div>

      <Section title="Logos & watermark" count={logos.length}>
        <div className="grid grid-cols-3 gap-2">
          {logos.map((l) => (
            <div key={l.id} className={`relative grid aspect-square place-items-center overflow-hidden rounded-2xl border bg-ink p-2 ${l.is_primary ? "border-bone" : "border-rule"}`}>
              {l.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={l.preview} alt={l.name} className="max-h-full max-w-full object-contain" />
              ) : (
                <Icon name="image" className="size-5 text-ash" />
              )}
              <span className="absolute left-1.5 top-1.5 rounded-full bg-ink/80 px-1.5 py-0.5 text-[10px] text-mist">{l.kind === "watermark" ? "Watermark" : l.is_primary ? "Main" : "Logo"}</span>
              <span className="absolute bottom-1.5 right-1.5"><AssetMenu asset={l} canBeMain /></span>
            </div>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <UploadButton workspaceId={workspaceId} kind="logo" accept="image/*,.svg" label="Add logo" icon="image" />
          <UploadButton workspaceId={workspaceId} kind="watermark" accept="image/*,.svg" label="Add watermark" icon="layers" />
        </div>
      </Section>

      <Section title="Colors" count={colors.length}>
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {colors.map((c) => (
            <div key={c.id} className={`overflow-hidden rounded-2xl border ${c.is_primary ? "border-bone" : "border-rule"}`}>
              <div className="h-14" style={{ background: c.value ?? undefined }} />
              <div className="flex items-center gap-1 px-2.5 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{c.name}</span>
                  <span className="tabular block text-[11px] uppercase text-ash">{c.value}{c.is_primary ? " · main" : ""}</span>
                </span>
                <AssetMenu asset={c} canBeMain />
              </div>
            </div>
          ))}
        </div>
        <ActionForm action={addBrandItem} resetOnSuccess className="flex items-end gap-2">
          <input type="hidden" name="workspace" value={workspaceId} />
          <input type="hidden" name="kind" value="color" />
          <label className="shrink-0">
            <span className="sr-only">Color</span>
            <input type="color" name="value" defaultValue="#ef4444" className="h-12 w-14 cursor-pointer rounded-xl border border-rule bg-char p-1" />
          </label>
          <input name="name" placeholder="Name (e.g. Brand red)" className="field h-12 min-w-0 flex-1" maxLength={120} />
          <SubmitButton className="h-12 shrink-0">Add</SubmitButton>
        </ActionForm>
      </Section>

      <Section title="Fonts" count={of("font").length}>
        <FileRows assets={of("font")} />
        <div className="mt-2"><UploadButton workspaceId={workspaceId} kind="font" accept=".ttf,.otf,.woff,.woff2" label="Add font files (.ttf, .otf)" icon="note" /></div>
      </Section>

      <Section title="Intro, outro & music" count={of("intro", "outro", "music").length}>
        <FileRows assets={of("intro", "outro", "music")} canBeMain />
        <div className="mt-2 grid grid-cols-3 gap-2">
          <UploadButton workspaceId={workspaceId} kind="intro" accept="video/*" label="Intro" icon="film" />
          <UploadButton workspaceId={workspaceId} kind="outro" accept="video/*" label="Outro" icon="film" />
          <UploadButton workspaceId={workspaceId} kind="music" accept="audio/*" label="Music" icon="audio" />
        </div>
      </Section>

      <Section title="References & photos" count={of("reference", "photo", "other").length}>
        <p className="mb-2 text-sm text-ash">Videos you want {name}&apos;s edits to feel like, product shots, team photos. Claude learns the brand from these.</p>
        <FileRows assets={of("reference", "photo", "other")} />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <UploadButton workspaceId={workspaceId} kind="reference" accept="video/*,image/*" label="Upload references" icon="film" />
          <UploadButton workspaceId={workspaceId} kind="photo" accept="image/*" label="Upload photos" icon="image" />
        </div>
        <ActionForm action={addBrandItem} resetOnSuccess className="mt-2 flex gap-2">
          <input type="hidden" name="workspace" value={workspaceId} />
          <input type="hidden" name="kind" value="reference" />
          <input name="url" type="url" inputMode="url" placeholder="Or paste a reel / TikTok / YouTube link" className="field h-12 min-w-0 flex-1" required />
          <SubmitButton variant="ghost" className="h-12 shrink-0">Add</SubmitButton>
        </ActionForm>
      </Section>
    </div>
  );
}

/** Projects (campaigns / series) for a client, each with its own brief and references. */
export function ProjectsTab({ workspaceId, projects, assets }: { workspaceId: string; projects: Project[]; assets: BrandAsset[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div>
      <Section title="New project">
        <ActionForm action={saveProject} resetOnSuccess className="grid gap-2">
          <input type="hidden" name="workspace" value={workspaceId} />
          <input name="name" required placeholder="e.g. Spring kitchen launch" className="field h-12" maxLength={120} />
          <textarea name="brief" placeholder="Brief: the goal, the offer, the feel, what to always show…" className="field min-h-24" maxLength={4000} />
          <SubmitButton>Create project</SubmitButton>
        </ActionForm>
      </Section>
      <Section title="Projects" count={projects.length}>
        {projects.length ? (
          <div className="grid gap-2">
            {projects.map((p, n) => {
              const refs = assets.filter((a) => a.project_id === p.id);
              const expanded = open === p.id;
              return (
                <div key={p.id} className="rise-in rounded-2xl border border-rule" style={{ animationDelay: `${Math.min(n, 6) * 40}ms` }}>
                  <button type="button" onClick={() => setOpen(expanded ? null : p.id)} aria-expanded={expanded} className="press flex w-full items-center gap-3 px-4 py-3 text-left">
                    <span className={`size-2 shrink-0 rounded-full ${p.status === "done" ? "bg-ash" : "bg-success"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{p.name}</span>
                      <span className="block text-xs text-ash">{p.videos} {p.videos === 1 ? "video" : "videos"} · {refs.length} {refs.length === 1 ? "reference" : "references"}{p.status === "done" ? " · done" : ""}</span>
                    </span>
                    <Icon name="chevron" className={`size-4 text-ash transition-transform ${expanded ? "rotate-90" : ""}`} />
                  </button>
                  {expanded ? (
                    <div className="grid gap-3 border-t border-rule px-4 py-4">
                      <ActionForm action={saveProject} className="grid gap-2">
                        <input type="hidden" name="workspace" value={workspaceId} />
                        <input type="hidden" name="id" value={p.id} />
                        <input name="name" defaultValue={p.name} className="field h-12" maxLength={120} required />
                        <textarea name="brief" defaultValue={p.brief ?? ""} placeholder="Brief" className="field min-h-24" maxLength={4000} />
                        <select name="status" defaultValue={p.status} className="field h-12">
                          <option value="active">Active</option>
                          <option value="done">Done</option>
                        </select>
                        <SubmitButton variant="ghost">Save project</SubmitButton>
                      </ActionForm>
                      <FileRows assets={refs} />
                      <UploadButton workspaceId={workspaceId} projectId={p.id} kind="reference" accept="video/*,image/*" label="Add references for this project" icon="film" />
                      <ActionForm action={addBrandItem} resetOnSuccess className="flex gap-2">
                        <input type="hidden" name="workspace" value={workspaceId} />
                        <input type="hidden" name="project" value={p.id} />
                        <input type="hidden" name="kind" value="reference" />
                        <input name="url" type="url" inputMode="url" placeholder="Paste a reference link" className="field h-12 min-w-0 flex-1" required />
                        <SubmitButton variant="ghost" className="h-12 shrink-0">Add</SubmitButton>
                      </ActionForm>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-rule px-5 py-8 text-center text-sm text-ash">No projects yet. Group videos into a campaign or series with its own brief.</p>
        )}
      </Section>
    </div>
  );
}
