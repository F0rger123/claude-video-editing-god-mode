"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Live updates: when a video, post or notification this person can see changes (the editor starts,
 * a render lands, a client approves…), the current screen reloads its data within a moment.
 * Supabase Realtime only sends rows the viewer may read (same rules as the app).
 */
export function LiveRefresh() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const supabase = createClient();
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      // Several rows often change together (job + post + notification): refresh once.
      timer.current = setTimeout(() => router.refresh(), 400);
    };
    const channel = supabase
      .channel("live")
      .on("postgres_changes", { event: "*", schema: "public", table: "content_jobs" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "content_posts" }, refresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "content_notifications" }, refresh)
      .subscribe();
    // Coming back to the app (unlocking the phone, switching apps): catch up straight away.
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [router]);
  return null;
}

function etaText(eta: string, now: number) {
  const mins = Math.round((Date.parse(eta) - now) / 60000);
  if (mins <= 1) return "Almost ready";
  if (mins < 60) return `Ready in about ${mins} min`;
  const at = new Date(eta).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const h = Math.floor(mins / 60);
  return `Ready around ${at} (about ${h} h${mins % 60 >= 15 ? ` ${Math.round((mins % 60) / 5) * 5} min` : ""})`;
}

/** "Ready in about 12 min" for a video waiting for or in the editor; counts down while open. */
export function Eta({ eta, status, className = "" }: { eta: string | null | undefined; status: string; className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = requestAnimationFrame(tick);
    const id = setInterval(tick, 30000);
    return () => {
      cancelAnimationFrame(first);
      clearInterval(id);
    };
  }, []);
  if (!eta || !["queued", "editing", "rendering"].includes(status) || now === null) return null;
  const late = Date.parse(eta) < now - 5 * 60000;
  return <span className={`tabular ${className}`}>{late ? "Taking a little longer than usual" : etaText(eta, now)}</span>;
}
