"use client";

import { useEffect } from "react";

const PWA_STATUS_EVENT = "pyro-crew-pwa-status-change";
const PWA_STATUS_STORAGE_KEY = "pyro-crew-pwa-status";

type PwaStatus = "PWA Ready" | "Service Worker Active" | "Not Available";

function publishPwaStatus(status: PwaStatus) {
  window.localStorage.setItem(PWA_STATUS_STORAGE_KEY, status);
  window.dispatchEvent(new CustomEvent(PWA_STATUS_EVENT, { detail: status }));
}

export function PwaServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      publishPwaStatus("Not Available");
      return;
    }

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(
            registrations.map((registration) => registration.unregister()),
          ),
        )
        .catch(() => undefined)
        .finally(() => publishPwaStatus("Not Available"));
      return;
    }

    if (!window.isSecureContext) {
      publishPwaStatus("Not Available");
      return;
    }

    let isMounted = true;

    navigator.serviceWorker
      .register("/sw.js")
      .then(() => {
        if (!isMounted) return;
        publishPwaStatus(
          navigator.serviceWorker.controller
            ? "Service Worker Active"
            : "PWA Ready",
        );

        return navigator.serviceWorker.ready.then(() => {
          if (!isMounted) return;
          publishPwaStatus("Service Worker Active");
        });
      })
      .catch(() => {
        if (!isMounted) return;
        publishPwaStatus("Not Available");
      });

    const handleControllerChange = () => {
      publishPwaStatus("Service Worker Active");
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      handleControllerChange,
    );

    return () => {
      isMounted = false;
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        handleControllerChange,
      );
    };
  }, []);

  return null;
}

export { PWA_STATUS_EVENT, PWA_STATUS_STORAGE_KEY };
export type { PwaStatus };