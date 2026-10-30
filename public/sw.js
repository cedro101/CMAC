// Lets the app open with no signal. Never touches /api, so chat and food
// lookups always go to the server. Bump CACHE_NAME to drop everything cached.
const CACHE_NAME = "cmac-v1";
const PAGES = ["/", "/progress", "/settings"];
const STATIC_ASSET = /\/_next\/static\/[^"'\\\s)]+/g;

// The first visit loads its scripts before this worker is in control, so
// find them in each page's HTML and cache them now.
async function precache() {
  const cache = await caches.open(CACHE_NAME);
  const assets = new Set(["/manifest.webmanifest", "/icons/icon-192.png"]);

  for (const page of PAGES) {
    const response = await fetch(page, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not precache ${page}`);
    await cache.put(page, response.clone());
    for (const asset of (await response.text()).match(STATIC_ASSET) ?? []) {
      assets.add(asset);
    }
  }

  await Promise.allSettled([...assets].map((asset) => cache.add(asset)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === "navigate") {
      const home = await cache.match("/");
      if (home) return home;
    }
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Next.js tab-switch data. If it fails offline, Next.js does a full page
  // load instead, and that is served from the cached pages.
  if (url.searchParams.has("_rsc") || request.headers.has("RSC")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request));
});
