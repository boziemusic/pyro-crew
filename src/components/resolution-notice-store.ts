"use client";

import { useSyncExternalStore } from "react";
import type { TemporaryTechnicianId } from "./temporary-technician-store";

type ResolutionAcknowledgements = Record<
  TemporaryTechnicianId,
  string[]
>;

const STORAGE_KEY = "pyro-crew-resolution-notice-acknowledgements";
const STORE_EVENT = "pyro-crew-resolution-notice-acknowledgements-change";
const EMPTY_ACKNOWLEDGEMENTS: ResolutionAcknowledgements = {
  tech_1: [],
  tech_2: [],
  tech_3: [],
  tech_4: [],
};

let cachedStorageValue: string | null = null;
let cachedAcknowledgements = EMPTY_ACKNOWLEDGEMENTS;

function readAcknowledgementsSnapshot() {
  if (typeof window === "undefined") {
    return EMPTY_ACKNOWLEDGEMENTS;
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);

  if (!stored) {
    cachedStorageValue = null;
    cachedAcknowledgements = EMPTY_ACKNOWLEDGEMENTS;
    return cachedAcknowledgements;
  }

  if (stored === cachedStorageValue) {
    return cachedAcknowledgements;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<
      ResolutionAcknowledgements
    >;
    cachedAcknowledgements = {
      tech_1: Array.isArray(parsed.tech_1) ? parsed.tech_1 : [],
      tech_2: Array.isArray(parsed.tech_2) ? parsed.tech_2 : [],
      tech_3: Array.isArray(parsed.tech_3) ? parsed.tech_3 : [],
      tech_4: Array.isArray(parsed.tech_4) ? parsed.tech_4 : [],
    };
    cachedStorageValue = stored;
    return cachedAcknowledgements;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    cachedStorageValue = null;
    cachedAcknowledgements = EMPTY_ACKNOWLEDGEMENTS;
    return cachedAcknowledgements;
  }
}

function subscribeToAcknowledgements(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(STORE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(STORE_EVENT, onStoreChange);
  };
}

export function useResolutionNoticeAcknowledgements() {
  return useSyncExternalStore(
    subscribeToAcknowledgements,
    readAcknowledgementsSnapshot,
    () => EMPTY_ACKNOWLEDGEMENTS,
  );
}

export function acknowledgeResolutionNotice(
  technicianId: TemporaryTechnicianId,
  issueId: string,
) {
  const acknowledgements = readAcknowledgementsSnapshot();
  const technicianAcknowledgements = new Set(
    acknowledgements[technicianId],
  );
  technicianAcknowledgements.add(issueId);

  const nextAcknowledgements = {
    ...acknowledgements,
    [technicianId]: [...technicianAcknowledgements],
  };
  const serialized = JSON.stringify(nextAcknowledgements);

  window.localStorage.setItem(STORAGE_KEY, serialized);
  cachedStorageValue = serialized;
  cachedAcknowledgements = nextAcknowledgements;
  window.dispatchEvent(new Event(STORE_EVENT));
}
