"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { formatTimestamp } from "@/lib/domain/feedback";

export type Mark = { id: string; at: number; body: string; author: string | null };

/**
 * The review player: portrait-first video, a scrub bar with the feedback marks on it,
 * and a "note at this moment" button. Exposes the current time through `onTime`.
 */
export function ReviewPlayer({ src, marks, onTime, poster }: { src: string; marks: Mark[]; onTime?: (t: number) => void; poster?: string | null }) {
  const video = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const onT = () => {
      setTime(v.currentTime);
      onTime?.(v.currentTime);
    };
    const onMeta = () => setDuration(v.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener("timeupdate", onT);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    return () => {
      v.removeEventListener("timeupdate", onT);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
    };
  }, [onTime]);

  const seek = (t: number) => {
    if (!video.current) return;
    video.current.currentTime = Math.max(0, Math.min(duration || t, t));
  };
  const toggle = () => (video.current?.paused ? video.current.play() : video.current?.pause());

  return (
    <div className="-mx-4 bg-ink sm:mx-0 sm:overflow-hidden sm:rounded-3xl sm:border sm:border-rule">
      <div className="relative mx-auto max-h-[72svh] w-full" style={{ aspectRatio: "9 / 16", maxWidth: "calc(72svh * 9 / 16)" }}>
        <video ref={video} src={src} poster={poster ?? undefined} playsInline preload="metadata" muted={muted} onClick={toggle} className="absolute inset-0 size-full bg-ink object-contain" />
        {!playing ? (
          <button type="button" onClick={toggle} aria-label="Play" className="absolute inset-0 grid place-items-center">
            <span className="grid size-16 place-items-center rounded-full bg-bone/90 text-ink">
              <Icon name="play" className="ml-1 size-7" />
            </span>
          </button>
        ) : null}
      </div>
      <div className="px-4 pb-3 pt-3 sm:px-5">
        <div className="relative h-8">
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.05}
            value={time}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Scrub"
            className="absolute inset-x-0 top-3 h-1 w-full cursor-pointer appearance-none rounded-full bg-graphite accent-bone [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-bone"
          />
          <div className="pointer-events-none absolute inset-x-0 top-[13px]">
            {duration
              ? marks.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    title={`${formatTimestamp(m.at)} ${m.body}`}
                    onClick={() => seek(m.at)}
                    className="mark pointer-events-auto"
                    style={{ left: `${(m.at / duration) * 100}%` }}
                  />
                ))
              : null}
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <button type="button" onClick={toggle} className="press grid size-10 place-items-center rounded-full border border-rule" aria-label={playing ? "Pause" : "Play"}>
            <Icon name={playing ? "pause" : "play"} className="size-4" />
          </button>
          <button type="button" onClick={() => seek(time - 2)} className="press h-10 rounded-full px-2 text-mist">−2s</button>
          <button type="button" onClick={() => seek(time + 2)} className="press h-10 rounded-full px-2 text-mist">+2s</button>
          <button type="button" onClick={() => setMuted(!muted)} className="press h-10 rounded-full px-2 text-mist">{muted ? "Unmute" : "Mute"}</button>
          <span className="tabular ml-auto text-mist">
            {formatTimestamp(time)} / {formatTimestamp(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}
