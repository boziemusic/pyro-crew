const STATIC_CACHE = "pyro-crew-static-v1";
const STATIC_PATH_PREFIXES = ["/_next/static/", "/icons/"];
const STATIC_PATHS = new Set(["/favicon.ico"]);

function isStaticAssetRequest(request) {
  if (request.method !== "GET") return false;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api/")) return false;

  if (STATIC_PATHS.has(url.pathname)) return true;
  if (STATIC_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    return true;
  }

  return ["font", "image", "script", "style"].includes(request.destination);
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== STATIC_CACHE)
            .map((cacheName) => caches.delete(cacheName)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (!isStaticAssetRequest(event.request)) {
    return;
  }

  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const cachedResponse = await cache.match(event.request);
      if (cachedResponse) {
        return cachedResponse;
      }

      const response = await fetch(event.request);
      if (response.ok) {
        cache.put(event.request, response.clone());
      }
      return response;
    }),
  );
});
self.addEventListener("push", (event) => {
  let notification = {
    body: "Open Pyro Crew Continuity for details.",
    data: { type: "system" },
    title: "Pyro Crew Continuity",
  };

  if (event.data) {
    try {
      notification = {
        ...notification,
        ...event.data.json(),
      };
    } catch {
      notification.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(notification.title, {
      body: notification.body,
      data: notification.data,
      icon: "/icons/pwa-192.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const technicianClient = clientList.find((client) => {
        try {
          return new URL(client.url).pathname.startsWith("/technician");
        } catch {
          return false;
        }
      });

      if (technicianClient && "focus" in technicianClient) {
        return technicianClient.focus();
      }

      if (clients.openWindow) {
        return clients.openWindow("/technician");
      }

      return undefined;
    }),
  );
});