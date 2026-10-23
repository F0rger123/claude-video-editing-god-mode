"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icons";
import { haptic } from "@/lib/haptics";

export type PrompterScript = { id: string; label: string; text: string };

const SPEEDS = [
  { label: "Slow", value: 22 },
  { label: "Normal", value: 36 },
  { label: "Fast", value: 55 },
];

/**
 * Record a take with the script scrolling over the camera.
 *  - Setup first: choose the script (saved ideas, or type your own), speed, text size, camera.
 *  - Preview = exactly what is recorded (no crop): the camera's own aspect, letterboxed, no forced
 *    resolution, so phones don't switch to a zoomed sensor crop.
 *  - Robust: rendered on top of everything (portal); screen kept awake while recording; if the
 *    camera stops (phone locked, call, app switch) the part already recorded is kept, not lost.
 */
export function Teleprompter({
  scripts,
  initialScriptId,
  form,
  onDone,
  onClose,
}: {
  scripts: PrompterScript[];
  initialScriptId?: string | null;
  form: "short" | "long";
  onDone: (file: File) => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const wake = useRef<{ release: () => Promise<void> } | null>(null);
  const [phase, setPhase] = useState<"setup" | "countdown" | "recording" | "done">("setup");
  const [camera, setCamera] = useState<"starting" | "ready" | "stopped" | "error">("starting");
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(3);
  const [scriptId, setScriptId] = useState(initialScriptId ?? scripts[0]?.id ?? "own");
  const [ownText, setOwnText] = useState("");
  const [speed, setSpeed] = useState(36);
  const [size, setSize] = useState(30);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [take, setTake] = useState<{ url: string; file: File } | null>(null);
  const [session, setSession] = useState(0);
  const text = scriptId === "own" ? ownText : scripts.find((s) => s.id === scriptId)?.text ?? "";

  // Camera
  useEffect(() => {
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      requestAnimationFrame(() => {
        setError("This browser cannot record. Use the Camera button instead.");
        setCamera("error");
      });
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: facing }, audio: { echoCancellation: true, noiseSuppression: true } })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        s.getVideoTracks()[0]?.addEventListener("ended", () => {
          setCamera("stopped");
          if (recorder.current?.state === "recording") recorder.current.stop(); // keep what was recorded
        });
        if (video.current) video.current.srcObject = s;
        setCamera("ready");
      })
      .catch((e: Error) => {
        setError(/denied|permission|notallowed/i.test(`${e.name} ${e.message}`) ? "Camera or microphone access is blocked. Allow it for this site in your phone's settings, then tap Try again." : `Camera not available: ${e.message}`);
        setCamera("error");
      });
    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, [facing, session]);

  // Leaving the app mid-take (call, lock screen): stop and keep the take instead of losing it.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && recorder.current?.state === "recording") recorder.current.stop();
    };
    document.addEventListener("visibilitychange", onHide);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      document.body.style.overflow = prev;
    };
  }, []);

  // Scroll the script while recording.
  useEffect(() => {
    if (phase !== "recording") return;
    let last = performance.now();
    let raf = 0;
    const step = (now: number) => {
      if (scroller.current && !paused) scroller.current.scrollTop += ((now - last) / 1000) * speed;
      last = now;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(timer);
    };
  }, [phase, speed, paused]);

  function begin() {
    haptic("select");
    setPhase("countdown");
    setCount(3);
    let n = 3;
    const t = setInterval(() => {
      n -= 1;
      setCount(n);
      haptic("tap");
      if (n <= 0) {
        clearInterval(t);
        start();
      }
    }, 1000);
  }

  async function start() {
    if (!stream.current) return;
    const type = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"].find((t) => MediaRecorder.isTypeSupported?.(t));
    const rec = new MediaRecorder(stream.current, type ? { mimeType: type, videoBitsPerSecond: 8_000_000 } : undefined);
    chunks.current = [];
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.onstop = () => {
      void wake.current?.release().catch(() => {});
      wake.current = null;
      if (!chunks.current.length) return setPhase("setup");
      const mime = rec.mimeType || "video/webm";
      const blob = new Blob(chunks.current, { type: mime });
      const file = new File([blob], `take-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${mime.includes("mp4") ? "mp4" : "webm"}`, { type: mime.split(";")[0] });
      setTake({ url: URL.createObjectURL(blob), file });
      setPhase("done");
      haptic("success");
    };
    recorder.current = rec;
    if (scroller.current) scroller.current.scrollTop = 0;
    setSeconds(0);
    setPaused(false);
    try {
      wake.current = await (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen") ?? null;
    } catch {
      // Wake lock is a nice-to-have.
    }
    rec.start(1000);
    setPhase("recording");
  }

  const stop = () => recorder.current?.state === "recording" && recorder.current.stop();
  const close = () => {
    if ((phase === "recording" || take) && !window.confirm("Discard this take?")) return;
    stop();
    onClose();
  };
  const retake = () => {
    if (take) URL.revokeObjectURL(take.url);
    setTake(null);
    setPhase("setup");
    if (camera !== "ready") setSession((n) => n + 1);
  };

  const ui = (
    <div className="fixed inset-0 z-[80] flex flex-col bg-ink text-bone" role="dialog" aria-modal="true" aria-label="Record with teleprompter">
      {/* Camera / playback: letterboxed so the preview is exactly the recorded frame. */}
      <div className="absolute inset-0 grid place-items-center bg-ink">
        {take ? (
          <video src={take.url} controls playsInline className="max-h-full max-w-full" />
        ) : (
          <video ref={video} autoPlay muted playsInline className={`max-h-full max-w-full ${facing === "user" ? "-scale-x-100" : ""}`} />
        )}
      </div>

      {phase === "recording" || phase === "countdown" ? (
        <div
          ref={scroller}
          onClick={() => setPaused((p) => !p)}
          className="absolute inset-x-0 top-0 h-[45%] overflow-y-auto bg-ink/70 px-6 pt-[max(1.25rem,env(safe-area-inset-top))] [scrollbar-width:none]"
        >
          <p className="mx-auto max-w-2xl whitespace-pre-wrap pb-[50vh] pt-6 text-center font-semibold leading-snug" style={{ fontSize: size }}>
            {text || "No script. Just talk."}
          </p>
          {paused ? <span className="pointer-events-none fixed left-1/2 top-[44%] -translate-x-1/2 rounded-full bg-bone px-3 py-1 text-xs font-semibold text-ink">Paused · tap to continue</span> : null}
        </div>
      ) : null}

      {phase === "countdown" ? <div className="pointer-events-none absolute inset-0 grid place-items-center text-9xl font-bold tabular">{count}</div> : null}

      {camera === "error" || camera === "stopped" ? (
        <div className="absolute inset-0 grid place-items-center bg-ink/80 p-8 text-center">
          <div>
            <p>{camera === "stopped" ? "The camera stopped (phone locked or another app used it). What you recorded is kept." : error}</p>
            <button type="button" onClick={() => { setCamera("starting"); setSession((n) => n + 1); }} className="press mt-4 h-12 rounded-full bg-bone px-6 font-semibold text-ink">Try again</button>
          </div>
        </div>
      ) : null}

      {/* Setup sheet */}
      {phase === "setup" ? (
        <div className="pb-safe absolute inset-x-0 bottom-0 max-h-[70%] overflow-y-auto rounded-t-3xl border-t border-rule bg-coal/95 px-5 pt-4 backdrop-blur">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-semibold">Teleprompter</p>
            <button type="button" onClick={close} className="press h-10 rounded-full px-3 text-sm text-mist">Close</button>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs text-ash">Script</span>
            <select value={scriptId} onChange={(e) => setScriptId(e.target.value)} className="field">
              {scripts.map((s) => <option key={s.id} value={s.id}>{s.label.slice(0, 70)}</option>)}
              <option value="own">Type my own…</option>
            </select>
          </label>
          {scriptId === "own" ? (
            <textarea value={ownText} onChange={(e) => setOwnText(e.target.value)} placeholder="Paste or write what you'll say" className="field mt-2 min-h-24" />
          ) : (
            <p className="mt-2 line-clamp-3 text-sm text-mist">{text}</p>
          )}
          <div className="mt-4">
            <span className="mb-1.5 block text-xs text-ash">Speed</span>
            <div className="grid grid-cols-3 gap-1 rounded-full border border-rule p-1 text-sm">
              {SPEEDS.map((s) => (
                <button key={s.label} type="button" onClick={() => setSpeed(s.value)} className={`press h-10 rounded-full ${speed === s.value ? "bg-bone font-semibold text-ink" : "text-mist"}`}>{s.label}</button>
              ))}
            </div>
            <input type="range" min={10} max={90} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Fine speed" className="mt-2 w-full accent-bone" />
          </div>
          <div className="mt-2 grid grid-cols-2 items-end gap-3">
            <label className="grid gap-1 text-xs text-ash">Text size<input type="range" min={20} max={52} value={size} onChange={(e) => setSize(Number(e.target.value))} className="accent-bone" /></label>
            <button type="button" onClick={() => setFacing(facing === "user" ? "environment" : "user")} className="press flex h-10 items-center justify-center gap-2 rounded-full border border-rule text-sm text-mist">
              <Icon name="refresh" className="size-4" /> {facing === "user" ? "Front camera" : "Back camera"}
            </button>
          </div>
          <button type="button" disabled={camera !== "ready"} onClick={begin} className="press mb-4 mt-5 flex h-14 w-full items-center justify-center gap-3 rounded-full bg-danger text-base font-semibold text-ink disabled:opacity-40">
            <span className="size-3 rounded-full bg-ink" /> {camera === "ready" ? "Start recording" : "Starting camera…"}
          </button>
          <p className="mb-2 text-center text-xs text-ash">{form === "short" ? "Hold the phone upright for short-form." : "Turn the phone sideways for long-form."} Tap the script while recording to pause it.</p>
        </div>
      ) : null}

      {/* Recording / review controls */}
      {phase === "recording" || phase === "done" ? (
        <div className="pb-safe absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/90 to-transparent px-5 pt-10">
          <div className="mx-auto flex max-w-md items-center justify-between pb-5">
            {phase === "recording" ? (
              <>
                <span className="w-24 text-sm">
                  <span className="mr-2 inline-block size-2 animate-pulse rounded-full bg-danger motion-reduce:animate-none" />
                  <span className="tabular">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span>
                </span>
                <button type="button" onClick={stop} aria-label="Stop recording" className="press grid size-20 place-items-center rounded-full border-4 border-bone">
                  <span className="size-8 rounded-md bg-danger" />
                </button>
                <span className="flex w-24 justify-end gap-1">
                  <button type="button" aria-label="Slower" onClick={() => setSpeed((s) => Math.max(10, s - 6))} className="press grid size-10 place-items-center rounded-full bg-ink/60 text-lg">−</button>
                  <button type="button" aria-label="Faster" onClick={() => setSpeed((s) => Math.min(90, s + 6))} className="press grid size-10 place-items-center rounded-full bg-ink/60 text-lg">+</button>
                </span>
              </>
            ) : (
              <>
                <button type="button" onClick={retake} className="press h-12 rounded-full px-4 text-sm text-mist">Retake</button>
                <button type="button" onClick={() => take && onDone(take.file)} className="press h-14 rounded-full bg-bone px-6 text-base font-semibold text-ink" data-haptic="success">Use this take</button>
                <button type="button" onClick={close} className="press h-12 rounded-full px-4 text-sm text-mist">Discard</button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(ui, document.body);
}
