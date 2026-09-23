// Minimal service worker: caches the app shell for offline fallback and lets
// the browser install this as a PWA. Deliberately conservative — it does not
// cache API responses (auth/session state must never be served stale) and
// only shows an offline fallback page when a navigation fails with no
// network, rather than trying to fully work offline (not appropriate for a
// data-driven SEO tool).

const CACHE_NAME = "rankly-shell-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([OFFLINE_URL]))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;

  event.respondWith(
    fetch(event.request).catch(() => caches.match(OFFLINE_URL))
  );
});
