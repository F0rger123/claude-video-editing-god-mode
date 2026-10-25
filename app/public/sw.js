/* God Mode Cut service worker.
 *
 *  - Static, content-hashed assets (/_next/static, icons, fonts): cache first.
 *  - App screens: "instant open". The last copy of each screen this phone loaded is shown at once,
 *    while a fresh copy is fetched in the background; the page then refreshes itself with live data
 *    (see <CachedRefresh />). Copies live only on this phone, are wiped on sign-in and sign-out, and are
 *    dropped whenever a new version of the app is deployed (the registration URL carries the build id).
 *  - Never cached: sign-in, password reset, email-link callbacks, /api, non-GET, other sites.
 */
// Stamped on every deploy (scripts/stamp-sw.mjs): a new value makes browsers install this worker.
const BUILD = "20261025035954";
const VERSION = `v5-${BUILD}`;
const STATIC = `azve-static-${VERSION}`;
const PAGES = `azve-pages-${VERSION}`;
const OFFLINE = "/offline.html";
const NEVER = /^\/(login|auth|reset-password|api|offline|no-access|downloads|\.well-known)(\/|$|\?)/;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC).then((cache) => cache.addAll([OFFLINE, "/icons/icon-192.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== STATIC && key !== PAGES).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "clear") event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))));
  if (event.data === "clear-pages") event.waitUntil(caches.delete(PAGES));
});

const isStatic = (url) =>
  url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || /\.(?:woff2?|ico)$/.test(url.pathname);

/** Mark a stored copy so the page knows to fetch live data right after it appears. */
async function marked(response) {
  const html = await response.text();
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(html.replace("<head>", '<head><meta name="azc-cached" content="1">'), { status: 200, headers });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth")) return;

  if (isStatic(url)) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  if (request.mode !== "navigate") return;

  if (NEVER.test(url.pathname)) {
    event.respondWith(fetch(request).catch(async () => (await caches.match(OFFLINE)) || Response.error()));
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(PAGES);
      const key = url.origin + url.pathname + url.search;
      const hit = await cache.match(key);
      const network = fetch(request).then(async (response) => {
        const html = (response.headers.get("content-type") || "").includes("text/html");
        // Signed out (redirected to /login) or an error: forget the copy instead of keeping it.
        if (response.ok && !response.redirected && html) await cache.put(key, response.clone());
        else await cache.delete(key);
        return response;
      });
      if (hit) {
        event.waitUntil(network.catch(() => {}));
        return marked(hit);
      }
      try {
        return await network;
      } catch {
        return (await caches.match(OFFLINE)) || Response.error();
      }
    })(),
  );
});

// ── Phone notifications (Web Push): edit ready, client upload, post failed… ──
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "New update", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "New update", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      data: { url: data.url || "/" },
      vibrate: [30, 60, 40],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) return open.focus().then(() => ("navigate" in open ? open.navigate(url) : null));
      return self.clients.openWindow(url);
    }),
  );
});
