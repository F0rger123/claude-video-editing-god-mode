/* God Mode Cut service worker.
 *
 *  - Static, content-hashed assets (/_next/static, icons, fonts): cache first.
 *  - App screens: "instant open". The last copy of each screen this phone loaded is shown at once,
 *    while a fresh copy is fetched in the background; the page then refreshes itself with live data
 *    (see <CachedRefresh />). Copies live only on this phone, are wiped on sign-in and sign-out, and are
 *    dropped whenever a new version of the app is deployed (the registration URL carries the build id).
 *  - Never cached: sign-in, password reset, email-link callbacks, /api, non-GET, other sites.
 */
const VERSION = new URL(self.location.href).searchParams.get("v") || "v4";
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
