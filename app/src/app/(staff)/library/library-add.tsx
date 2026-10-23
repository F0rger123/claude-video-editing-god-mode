"use client";

import { useRouter } from "next/navigation";
import { useActionState, useRef, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import { Icon } from "@/components/icons";
import type { ActionState } from "@/lib/forms";
import { addLibraryItem, finishLibraryUpload, prepareLibraryUpload } from "./actions";

const KINDS = [
  ["sfx", "Sound effect"],
  ["overlay", "Overlay / film burn"],
  ["lut", "LUT / color"],
  ["font", "Font"],
  ["caption", "Caption style"],
  ["music", "Music"],
  ["reference", "Reference"],
  ["other", "Other"],
] as const;

function put(url: string, file: File, onProgress: (p: number) => void): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.send(file);
  });
}

/** Add to the library three ways: upload files, paste a link, or point at a file on the editing PC. */
export function LibraryAdd({ workspaces, defaultKind }: { workspaces: { id: string; name: string }[]; defaultKind: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<"upload" | "link" | "pc">("upload");
  const [kind, setKind] = useState(defaultKind);
  const [ws, setWs] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<ActionState>({});
  const [linkState, linkAction] = useActionState(addLibraryItem, {} as ActionState);

  async function upload() {
    setBusy(true);
    setMsg({});
    const prep = await prepareLibraryUpload({ kind, workspaceId: ws || null, notes, files: files.map((f) => ({ name: f.name, size: f.size, type: f.type })) });
    if (prep.error || !prep.uploads) {
      setBusy(false);
      return setMsg({ error: prep.error ?? "Could not start." });
    }
    await Promise.all(prep.uploads.map((u, i) => put(u.url, files[i], (p) => setProgress((cur) => ({ ...cur, [files[i].name]: p })))));
    const done = await finishLibraryUpload(prep.uploads.map((u) => u.id));
    setBusy(false);
    setFiles([]);
    setProgress({});
    setMsg(done.missing ? { error: `${done.missing} file(s) did not finish. Try again.` } : { success: "Added. The editing PC picks them up within 5 minutes." });
    router.refresh();
  }

  const common = (
    <>
      <select value={kind} onChange={(e) => setKind(e.target.value)} name="kind" className="field" aria-label="Type">
        {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <select value={ws} onChange={(e) => setWs(e.target.value)} name="workspace" className="field" aria-label="For">
        <option value="">All clients</option>
        {workspaces.map((w) => <option key={w.id} value={w.id}>Only {w.name}</option>)}
      </select>
      <input value={notes} onChange={(e) => setNotes(e.target.value)} name="notes" placeholder="When to use it (e.g. riser into a big reveal)" className="field" />
    </>
  );

  return (
    <div className="rounded-3xl border border-rule p-4">
      <div className="mb-4 grid grid-cols-3 gap-1 rounded-full border border-rule p-1 text-sm">
        {([["upload", "Upload"], ["link", "Link"], ["pc", "On my PC"]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setSource(k)} className={`press h-10 rounded-full ${source === k ? "bg-bone font-semibold text-ink" : "text-mist"}`}>{l}</button>
        ))}
      </div>

      {source === "upload" ? (
        <div className="grid gap-3">
          <input ref={input} type="file" multiple accept="audio/*,video/*,image/*,.cube,.ttf,.otf,.woff,.woff2,.zip" className="sr-only" onChange={(e) => { setFiles(Array.from(e.target.files ?? [])); if (e.target.files?.[0]?.type.startsWith("audio/")) setKind("sfx"); e.target.value = ""; }} />
          <button type="button" onClick={() => input.current?.click()} className="press flex min-h-24 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-rule-strong text-mist hover:border-bone hover:text-bone">
            <Icon name="upload" className="size-6" />
            <span className="font-medium text-bone">{files.length ? `${files.length} file(s) chosen` : "Choose sound effects, overlays, fonts…"}</span>
          </button>
          {files.length ? (
            <ul className="grid gap-1 text-sm">
              {files.map((f) => (
                <li key={f.name} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <span className="tabular text-xs text-ash">{progress[f.name] ?? 0}%</span>
                </li>
              ))}
            </ul>
          ) : null}
          {common}
          <button type="button" disabled={!files.length || busy} onClick={upload} className="press h-12 rounded-full bg-bone text-sm font-semibold text-ink disabled:opacity-40">{busy ? "Uploading…" : "Add to library"}</button>
          <FormMessage state={msg} />
        </div>
      ) : (
        <form action={linkAction} className="grid gap-3">
          <input type="hidden" name="source" value={source} />
          <input name="value" required className="field" inputMode={source === "link" ? "url" : "text"} placeholder={source === "link" ? "https://… (a sound page or a direct file link)" : "C:\\Users\\you\\Music\\Whoosh.wav or a whole folder"} />
          <input name="name" className="field" placeholder="Name (optional)" />
          {common}
          <SubmitButton>{source === "link" ? "Add link" : "Add file from PC"}</SubmitButton>
          {source === "pc" ? <p className="text-xs text-ash">Tip: in File Explorer, hold Shift, right-click the file, choose “Copy as path”, paste here. The editing PC copies it so Claude can always reach it.</p> : null}
          <FormMessage state={linkState} />
        </form>
      )}
    </div>
  );
}
