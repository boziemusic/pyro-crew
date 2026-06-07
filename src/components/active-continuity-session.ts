"use client";

import { useSyncExternalStore } from "react";

export type ActiveContinuitySession = {
  id: string;
  show_id: string;
  name: string;
  status: string;
  started_at: string;
};

const STORAGE_KEY = "pyro-crew-active-continuity-session";
const STORE_EVENT = "pyro-crew-active-continuity-session-change";

let cachedStorageValue: string | null = null;
let cachedSession: ActiveContinuitySession | null = null;

function readSessionSnapshot() {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);

  if (!stored) {
    cachedStorageValue = null;
    cachedSession = null;
    return null;
  }

  if (stored === cachedStorageValue) {
    return cachedSession;
  }

  try {
    cachedStorageValue = stored;
    cachedSession = JSON.parse(stored) as ActiveContinuitySession;
    return cachedSession;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    cachedStorageValue = null;
    cachedSession = null;
    return null;
  }
}

function subscribeToSession(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(STORE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(STORE_EVENT, onStoreChange);
  };
}

export function useActiveContinuitySession() {
  return useSyncExternalStore(
    subscribeToSession,
    readSessionSnapshot,
    () => null,
  );
}

export function setActiveContinuitySession(
  session: ActiveContinuitySession | null,
) {
  if (session) {
    const serialized = JSON.stringify(session);
    window.localStorage.setItem(STORAGE_KEY, serialized);
    cachedStorageValue = serialized;
    cachedSession = session;
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
    cachedStorageValue = null;
    cachedSession = null;
  }

  window.dispatchEvent(new Event(STORE_EVENT));
}

export function getContinuitySessionPolicyMessage(action: string) {
  return `${action} Developer action: add temporary anon SELECT, INSERT, and UPDATE RLS policies for public.continuity_sessions, and verify the lifecycle status values are "active" and "ended".`;
}
