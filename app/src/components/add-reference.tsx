"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { completeUpload, prepareUpload } from "@/app/actions/upload";
import { Icon } from "@/components/icons";
import { Sheet } from "@/components/sheet";
import { haptic } from "@/lib/haptics";

/**
 * Add a reference to a video in two taps: paste a link (reel, TikTok, YouTube…) or pick a
 * photo / screen recording. It's attached as "reference only" and the editor sees it.
 */
export function AddReference({ jobId, workspaceId, label = "Add reference" }: { jobId: string; workspaceId: string; label?: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});

  async function send(files: File[]) {
    if (!files.length && !link.trim() && !note.trim()) return setMsg({ error: "Paste a link or choose a file." });
    setBusy(true);
    setMsg({});
    const prepared = await prepareUpload({
      workspaceId,
      mode: "job",
      existingJobId: jobId,
      files: files.map((f) => ({ name: f.name, size: f.size, type: f.type, kind: f.type.startsWith("image/") ? "reference_image" : "reference_video", role: "reference" })),
      links: link.trim() ? [link.trim()] : [],
      note: note.trim() || undefined,
    });
    if (prepared.error || !prepared.uploads) {
      setBusy(false);
      haptic("error");
      return setMsg({ error: prepared.error ?? "Couldn't add it." });
    }
    const uploaded: string[] = [];
    for (const [i, u] of prepared.uploads.entries()) {
      const r = await fetch(u.url, { method: "PUT", body: files[i], headers: { "Content-Type": files[i].type || "application/octet-stream", "x-upsert": "false" } }).catch(() => null);
      if (r?.ok) uploaded.push(u.mediaId);
    }
    const done = await completeUpload({ workspaceId, jobId, group: prepared.group!, uploaded, failed: prepared.uploads.filter((u) => !uploaded.includes(u.mediaId)).map((u) => u.mediaId) });
    setBusy(false);
    if (done.error || done.missing) {
      haptic("error");
      return setMsg({ error: done.error ?? "A file didn't finish uploading. Try again." });
    }
    haptic("success");
    setLink("");
    setNote("");
    setMsg({ ok: "Added. The editor will use it." });
    router.refresh();
  }

  async function paste() {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (/^https?:\/\//i.test(text)) setLink(text);
      else setMsg({ error: "No link on the clipboard. Copy the reel's link first." });
    } catch {
      setMsg({ error: "Paste the link into the box instead." });
    }
  }

  return (
    <>
      <button type="button" onClick={() => { setMsg({}); setOpen(true); }} className="press inline-flex h-10 items-center gap-2 rounded-full border border-rule-strong px-4 text-sm">
        <Icon name="link" className="size-4" /> {label}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Add a reference">
        <input ref={input} type="file" multiple accept="image/*,video/*" className="sr-only" onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; void send(f); }} />
        <div className="grid gap-3">
          <div className="flex gap-2">
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://www.instagram.com/reel/…" inputMode="url" className="field h-12 min-w-0 flex-1" />
            <button type="button" onClick={paste} className="press h-12 shrink-0 rounded-full border border-rule-strong px-4 text-sm">Paste</button>
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What do you like about it? (optional)" className="field h-12" maxLength={500} />
          <button type="button" disabled={busy} onClick={() => void send([])} className="press flex h-12 items-center justify-center gap-2 rounded-full bg-bone font-semibold text-ink disabled:opacity-60">
            {busy ? "Adding…" : "Add link"}
          </button>
          <div className="flex items-center gap-3 text-xs text-ash"><span className="h-px flex-1 bg-rule" /> or <span className="h-px flex-1 bg-rule" /></div>
          <button type="button" disabled={busy} onClick={() => input.current?.click()} className="press flex h-12 items-center justify-center gap-2 rounded-full border border-rule-strong text-sm disabled:opacity-60">
            <Icon name="image" className="size-4" /> Photo, screenshot or video
          </button>
          {msg.error ? <p role="alert" className="text-sm text-danger">{msg.error}</p> : null}
          {msg.ok ? <p role="status" className="text-sm text-success">{msg.ok}</p> : null}
        </div>
      </Sheet>
    </>
  );
}
