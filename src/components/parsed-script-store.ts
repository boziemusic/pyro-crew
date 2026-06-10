"use client";

import { useSyncExternalStore } from "react";
import type {
  ParsedScriptRow,
  ScriptAdapterKey,
  ScriptParseResult,
} from "@/lib/script-adapters";

export type StoredParsedScript = ScriptParseResult & {
  showId: string;
  adapterKey: ScriptAdapterKey;
  filename: string;
  parsedAt: string;
};

type ParsedScriptStore = Record<string, StoredParsedScript>;

const STORAGE_KEY = "pyro-crew-parsed-scripts";
const STORE_EVENT = "pyro-crew-parsed-scripts-change";
const EMPTY_STORE: ParsedScriptStore = {};

let cachedStorageValue: string | null = null;
let cachedStore = EMPTY_STORE;

function readStoreSnapshot() {
  if (typeof window === "undefined") {
    return EMPTY_STORE;
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);

  if (!stored) {
    cachedStorageValue = null;
    cachedStore = EMPTY_STORE;
    return cachedStore;
  }

  if (stored === cachedStorageValue) {
    return cachedStore;
  }

  try {
    cachedStorageValue = stored;
    cachedStore = JSON.parse(stored) as ParsedScriptStore;
    return cachedStore;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    cachedStorageValue = null;
    cachedStore = EMPTY_STORE;
    return cachedStore;
  }
}

function subscribeToStore(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(STORE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(STORE_EVENT, onStoreChange);
  };
}

export function useParsedScripts() {
  return useSyncExternalStore(
    subscribeToStore,
    readStoreSnapshot,
    () => EMPTY_STORE,
  );
}

export function saveParsedScript(
  showId: string,
  adapterKey: ScriptAdapterKey,
  filename: string,
  result: ScriptParseResult,
) {
  const nextStore = {
    ...readStoreSnapshot(),
    [showId]: {
      ...result,
      showId,
      adapterKey,
      filename,
      parsedAt: new Date().toISOString(),
    },
  };
  const serialized = JSON.stringify(nextStore);

  window.localStorage.setItem(STORAGE_KEY, serialized);
  cachedStorageValue = serialized;
  cachedStore = nextStore;
  window.dispatchEvent(new Event(STORE_EVENT));
}

export function findParsedScriptRow(
  rows: ParsedScriptRow[],
  channelNumber: number,
  cueValue: string,
) {
  const normalizedCue = cueValue.trim().toLowerCase();

  return (
    rows.find(
      (row) =>
        row.channel_number === channelNumber &&
        row.cue_value?.trim().toLowerCase() === normalizedCue,
    ) ?? null
  );
}

// TODO(database parsed rows): persist normalized script rows in Supabase.
