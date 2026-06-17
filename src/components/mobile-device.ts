"use client";

import { useSyncExternalStore } from "react";

function getMobileDeviceSnapshot() {
  if (typeof window === "undefined") {
    return false;
  }

  const userAgent = navigator.userAgent;
  const isKnownMobileOrTablet = /iPhone|iPad|Android/i.test(userAgent);
  const isNarrowViewport = window.innerWidth < 768;

  return isKnownMobileOrTablet || isNarrowViewport;
}

function subscribeToMobileDeviceChanges(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  window.addEventListener("resize", onStoreChange);
  window.addEventListener("orientationchange", onStoreChange);

  return () => {
    window.removeEventListener("resize", onStoreChange);
    window.removeEventListener("orientationchange", onStoreChange);
  };
}

export function useIsMobileDevice() {
  return useSyncExternalStore(
    subscribeToMobileDeviceChanges,
    getMobileDeviceSnapshot,
    () => false,
  );
}
