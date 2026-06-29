"use client";

import { useEffect, useState } from "react";
import {
  PWA_STATUS_EVENT,
  PWA_STATUS_STORAGE_KEY,
  type PwaStatus,
} from "./pwa-service-worker-registration";

function getInitialPwaStatus(): PwaStatus {
  if (typeof window === "undefined") {
    return "Not Available";
  }

  const storedStatus = window.localStorage.getItem(
    PWA_STATUS_STORAGE_KEY,
  ) as PwaStatus | null;

  if (storedStatus) {
    return storedStatus;
  }

  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    return "Service Worker Active";
  }

  return "Not Available";
}

export function PwaStatusLine() {
  const [status, setStatus] = useState<PwaStatus>(getInitialPwaStatus);

  useEffect(() => {
    const handleStatusChange = (event: Event) => {
      const customEvent = event as CustomEvent<PwaStatus>;
      setStatus(customEvent.detail);
    };

    window.addEventListener(PWA_STATUS_EVENT, handleStatusChange);
    return () => {
      window.removeEventListener(PWA_STATUS_EVENT, handleStatusChange);
    };
  }, []);

  return (
    <p className="border-t border-white/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#94a3b8]">
      PWA: <span className="text-[#d8c8ff]">{status}</span>
    </p>
  );
}