"use client";

import { useSyncExternalStore } from "react";

function getMobileDeviceSnapshot() {
  if (typeof window === "undefined") {
    return false;
  }

  const hasCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const hasNoHover = window.matchMedia("(hover: none)").matches;
  const hasTouchPoints = navigator.maxTouchPoints > 0;
  const isNarrowViewport = window.innerWidth < 768;

  return hasCoarsePointer || hasNoHover || hasTouchPoints || isNarrowViewport;
}

function subscribeToMobileDeviceChanges(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const coarsePointerQuery = window.matchMedia("(pointer: coarse)");
  const hoverQuery = window.matchMedia("(hover: none)");

  coarsePointerQuery.addEventListener("change", onStoreChange);
  hoverQuery.addEventListener("change", onStoreChange);
  window.addEventListener("resize", onStoreChange);
  window.addEventListener("orientationchange", onStoreChange);

  return () => {
    coarsePointerQuery.removeEventListener("change", onStoreChange);
    hoverQuery.removeEventListener("change", onStoreChange);
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
