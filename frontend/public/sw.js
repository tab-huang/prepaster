// Crisis-to-Action service worker.
// Goal: the app shell (HTML/JS/CSS/fonts) opens even with no connectivity, so a
// user can still view their last saved plan during a disaster. Strategy is
// stale-while-revalidate for same-origin GETs; API and cross-origin requests are
// left to the network (the app already degrades gracefully when they fail).

const CACHE = "c2a-shell-v2";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Never cache the API — those responses are situational and must be live.
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          // Only cache successful, same-origin (+ font) responses.
          if (res && res.status === 200 && (url.origin === self.location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname))) {
            cache.put(req, res.clone());
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })()
  );
});
