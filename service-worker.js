const CACHE_NAME = "zone2-static-v16";
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/talk-test.html",
  "/train.html",
  "/site.css",
  "/site-shared.js",
  "/calc-pending.js",
  "/calc.js",
  "/talk-test.js",
  "/manifest.webmanifest",
  "/images/apple-touch-icon.png",
  "/images/favicon-16x16.png",
  "/images/favicon-32x32.png",
  "/images/icon-192x192.png",
  "/images/icon-512x512.png",
  "/images/icon-maskable-512x512.png",
  "/images/og-image-1200x630.png",
  "/images/z24u-logo_dark.png",
  "/images/logo_garmin.png",
  "/images/logo_polar.jpg",
  "/images/logo_wahoo.webp",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  const isTopLevelDocument =
    event.request.mode === "navigate" || event.request.destination === "document";

  if (isTopLevelDocument) {
    event.respondWith(
      fetch(event.request).catch(() => {
        const path = new URL(event.request.url).pathname;
        return caches.match(path).then((cached) => cached || caches.match("/index.html"));
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== "basic") {
            return response;
          }
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          return response;
        })
        .catch(function () {
          return caches.match(event.request);
        });
    })
  );
});
