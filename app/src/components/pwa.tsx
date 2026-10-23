"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Registers the service worker in production. The build id in the URL makes every deploy install a
 * fresh worker, which drops screens stored by the previous version. Failures are ignored.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(`/sw.js?v=${process.env.NEXT_PUBLIC_BUILD_ID ?? "dev"}`, { scope: "/" }).catch(() => {});
  }, []);
  return null;
}

/**
 * When the service worker opened this screen from the phone's stored copy (instant), fetch the
 * live data straight away, with a thin bar at the top until it arrives. `stamp` is rendered by the
 * server on every request, so a new stamp means the live data is on screen. Then the marker is
 * removed and <html data-fresh> is set (tests wait for it).
 */
export function CachedRefresh({ stamp }: { stamp: string }) {
  const router = useRouter();
  const [first] = useState(stamp);
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    if (!document.querySelector('meta[name="azc-cached"]')) {
      document.documentElement.dataset.fresh = "1";
      return;
    }
    const id = requestAnimationFrame(() => {
      setWaiting(true);
      router.refresh();
    });
    return () => cancelAnimationFrame(id);
  }, [router]);
  const arrived = stamp !== first;
  useEffect(() => {
    if (!arrived) return;
    document.querySelector('meta[name="azc-cached"]')?.remove();
    document.documentElement.dataset.fresh = "1";
  }, [arrived]);
  if (!waiting || arrived) return null;
  return <div role="progressbar" aria-label="Updating" className="updating-bar fixed inset-x-0 top-0 z-[60] h-0.5" />;
}

/** Called on sign-out so nothing lingers on a shared phone. */
export function clearOfflineData() {
  try {
    navigator.serviceWorker?.controller?.postMessage("clear");
    void caches?.keys().then((keys) => keys.forEach((key) => void caches.delete(key)));
  } catch {
    // Nothing cached.
  }
}

/** Called on sign-in: screens stored for whoever used this phone before must not show. */
export function clearStoredScreens() {
  try {
    navigator.serviceWorker?.controller?.postMessage("clear-pages");
    void caches?.keys().then((keys) => keys.filter((key) => key.startsWith("azve-pages-")).forEach((key) => void caches.delete(key)));
  } catch {
    // Nothing cached.
  }
}
