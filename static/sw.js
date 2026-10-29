const CACHE = "storage-v7";
const SHELL = [
  "/",
  "/static/shell.html",
  "/static/app.css",
  "/static/app.js"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.origin !== location.origin) return;

  // API/thumb/media: network only, never cache
  if (url.pathname.startsWith("/api/") || url.pathname === "/thumb") return;

  // Navigation: network-first, fallback to cached shell (offline)
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request, { cache: "reload" })
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  // Static: network-first (fresh on deploy) with cache fallback (offline)
  e.respondWith(
    fetch(e.request, { cache: "reload" })
      .then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});