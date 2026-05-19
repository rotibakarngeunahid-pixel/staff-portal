const CACHE_NAME = "rbn-staff-portal-runtime-v2";
const CACHE_PREFIX = "rbn-staff-portal-";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        const staleCacheKeys = keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME);
        return Promise.all(staleCacheKeys.map((key) => caches.delete(key))).then(() => staleCacheKeys.length > 0);
      })
      .then((hadStaleCaches) => self.clients.claim().then(() => hadStaleCaches))
      .then((hadStaleCaches) => {
        if (!hadStaleCaches) return undefined;

        return self.clients
          .matchAll({ type: "window", includeUncontrolled: true })
          .then((clients) =>
            Promise.all(
              clients.map((client) => {
                const clientUrl = new URL(client.url);
                if (clientUrl.origin !== self.location.origin) return undefined;
                if (!clientUrl.pathname.startsWith("/admin") && !clientUrl.pathname.startsWith("/app")) return undefined;
                return client.navigate(client.url).catch(() => undefined);
              })
            )
          );
      })
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request).catch(
        () =>
          new Response(JSON.stringify({ ok: false, error: "Offline" }), {
            headers: { "Content-Type": "application/json" },
            status: 503
          })
      )
    );
    return;
  }

  if (
    event.request.mode === "navigate" ||
    event.request.destination === "document" ||
    url.pathname.startsWith("/_next/") ||
    url.pathname === "/sw.js" ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(fetch(event.request));
  }
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data?.type === "CLEAR_STALE_CACHES") {
    event.waitUntil(
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
              .map((key) => caches.delete(key))
          )
        )
    );
  }
});
