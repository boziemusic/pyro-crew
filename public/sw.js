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
  let payload = null;

  if (event.data) {
    try {
      payload = event.data.json();
      console.log("PUSH RECEIVED", payload);
    } catch {
      const textPayload = event.data.text();
      console.log("PUSH RECEIVED", textPayload);
      payload = {
        body: textPayload,
      };
    }
  } else {
    console.log("PUSH RECEIVED", null);
  }

  const notificationPayload = payload?.notification ?? payload ?? {};
  const title = notificationPayload.title ?? payload?.title ?? "Pyro Crew Alert";
  const body =
    notificationPayload.body ??
    payload?.body ??
    "Open Pyro Crew Continuity for details.";
  const data =
    notificationPayload.data ??
    payload?.data ?? {
      type: "system",
    };

  const notificationOptions = {
    badge: notificationPayload.badge ?? "/icons/pwa-192.png",
    body,
    data,
    icon: notificationPayload.icon ?? "/icons/pwa-192.png",
    requireInteraction: notificationPayload.requireInteraction ?? true,
    vibrate: notificationPayload.vibrate ?? [200, 100, 200, 100, 200],
  };

  console.log("SHOW NOTIFICATION", { title, options: notificationOptions });

  event.waitUntil(
    self.registration
      .showNotification(title, notificationOptions)
      .then(() => console.log("SHOW NOTIFICATION EXECUTED", title)),
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