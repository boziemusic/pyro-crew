"use client";

import { useSyncExternalStore } from "react";
import { useActiveContinuitySession } from "./active-continuity-session";
import { ISSUE_IDENTIFIER_VALUE_CLASS_NAME } from "./issue-identifiers";

export type ActiveShow = {
  id: string;
  name: string;
  show_mode: "scripted" | "manual";
  firing_system?: string | null;
  script_adapter?: string | null;
  script_filename?: string | null;
  script_uploaded_at?: string | null;
};

export const ACTIVE_SHOW_STORAGE_KEY = "pyro-crew-active-show";
export const ACTIVE_SHOW_EVENT = "pyro-crew-active-show-change";
export const ACTIVE_SHOW_NEUTRAL_SURFACE =
  "border-[#4c00a4]/30 bg-[#130a2b]/90";
export const ACTIVE_SHOW_SUCCESS_SURFACE =
  "border-[#2f6b51]/70 bg-[#0d251c]/95";
export const ACTIVE_SHOW_NEUTRAL_SECONDARY_TEXT = "text-[#c4b5fd]";
export const ACTIVE_SHOW_SUCCESS_SECONDARY_TEXT = "text-[#a7d7bd]";

let cachedStorageValue: string | null = null;
let cachedActiveShow: ActiveShow | null = null;

export function readActiveShowSnapshot() {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.localStorage.getItem(ACTIVE_SHOW_STORAGE_KEY);

  if (!stored) {
    cachedStorageValue = null;
    cachedActiveShow = null;
    return null;
  }

  if (stored === cachedStorageValue) {
    return cachedActiveShow;
  }

  try {
    cachedStorageValue = stored;
    cachedActiveShow = JSON.parse(stored) as ActiveShow;
    return cachedActiveShow;
  } catch {
    window.localStorage.removeItem(ACTIVE_SHOW_STORAGE_KEY);
    cachedStorageValue = null;
    cachedActiveShow = null;
    return null;
  }
}

export function subscribeToActiveShowStore(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(ACTIVE_SHOW_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(ACTIVE_SHOW_EVENT, onStoreChange);
  };
}

export function getServerActiveShowSnapshot() {
  return null;
}

export function useActiveShow() {
  return useSyncExternalStore(
    subscribeToActiveShowStore,
    readActiveShowSnapshot,
    getServerActiveShowSnapshot,
  );
}

export function ActiveShowStrip() {
  const activeShow = useActiveShow();
  const activeSession = useActiveContinuitySession();
  const sessionForActiveShow =
    activeSession?.show_id === activeShow?.id ? activeSession : null;
  const surfaceClassName = activeShow
    ? ACTIVE_SHOW_SUCCESS_SURFACE
    : ACTIVE_SHOW_NEUTRAL_SURFACE;
  const secondaryTextClassName = activeShow
    ? ACTIVE_SHOW_SUCCESS_SECONDARY_TEXT
    : ACTIVE_SHOW_NEUTRAL_SECONDARY_TEXT;

  return (
    <div className={`border-t ${surfaceClassName}`}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-1 px-5 py-2 sm:px-8 md:flex-row md:items-center md:justify-between">
        <p className="text-sm font-semibold text-[#f8fafc]">
          Active Show:{" "}
          <strong className={ISSUE_IDENTIFIER_VALUE_CLASS_NAME}>
            {activeShow?.name ?? "None Selected"}
          </strong>
          {sessionForActiveShow ? (
            <>
              {" | Session: "}
              <strong className={ISSUE_IDENTIFIER_VALUE_CLASS_NAME}>
                {sessionForActiveShow.name}
              </strong>
            </>
          ) : null}
        </p>
        <p className={`text-xs italic ${secondaryTextClassName}`}>
          Script: {activeShow?.script_filename ?? "No script loaded"}
        </p>
      </div>
    </div>
  );
}
