"use client";

import { useSyncExternalStore } from "react";
import type { TemporaryTechnicianId } from "./temporary-technician-store";

export type TemporaryHandoff = {
  id: string;
  issueId: string;
  showId: string;
  fromTechnician: TemporaryTechnicianId;
  toTechnician: TemporaryTechnicianId;
  previousStatus: string;
  channelNumber: number;
  cueValue: string;
  issueType: string;
  positionName: string | null;
  effectName: string | null;
  reassignedAt: string;
  handoffNote: string | null;
  outgoingAcknowledged: boolean;
  incomingAccepted: boolean;
};

const STORAGE_KEY = "pyro-crew-temporary-handoffs";
export const TEMPORARY_HANDOFF_EVENT =
  "pyro-crew-temporary-handoffs-change";
const EMPTY_HANDOFFS: TemporaryHandoff[] = [];

let cachedStorageValue: string | null = null;
let cachedHandoffs = EMPTY_HANDOFFS;

function readHandoffsSnapshot() {
  if (typeof window === "undefined") {
    return EMPTY_HANDOFFS;
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);

  if (!stored) {
    cachedStorageValue = null;
    cachedHandoffs = EMPTY_HANDOFFS;
    return cachedHandoffs;
  }

  if (stored === cachedStorageValue) {
    return cachedHandoffs;
  }

  try {
    cachedStorageValue = stored;
    cachedHandoffs = JSON.parse(stored) as TemporaryHandoff[];
    return cachedHandoffs;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    cachedStorageValue = null;
    cachedHandoffs = EMPTY_HANDOFFS;
    return cachedHandoffs;
  }
}

function subscribeToHandoffs(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(TEMPORARY_HANDOFF_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(TEMPORARY_HANDOFF_EVENT, onStoreChange);
  };
}

function writeHandoffs(handoffs: TemporaryHandoff[]) {
  const serialized = JSON.stringify(handoffs);
  window.localStorage.setItem(STORAGE_KEY, serialized);
  cachedStorageValue = serialized;
  cachedHandoffs = handoffs;
  window.dispatchEvent(new Event(TEMPORARY_HANDOFF_EVENT));
}

export function useTemporaryHandoffs() {
  return useSyncExternalStore(
    subscribeToHandoffs,
    readHandoffsSnapshot,
    () => EMPTY_HANDOFFS,
  );
}

export function createTemporaryHandoff(
  handoff: Omit<
    TemporaryHandoff,
    "id" | "reassignedAt" | "handoffNote" | "outgoingAcknowledged" | "incomingAccepted"
  >,
) {
  const reassignedAt = new Date().toISOString();
  const nextHandoff: TemporaryHandoff = {
    ...handoff,
    id: `${handoff.issueId}:${reassignedAt}`,
    reassignedAt,
    handoffNote: null,
    outgoingAcknowledged: false,
    incomingAccepted: false,
  };

  writeHandoffs([...readHandoffsSnapshot(), nextHandoff]);
  return nextHandoff;
}

export function acknowledgeTemporaryHandoff(
  handoffId: string,
  handoffNote: string | null,
) {
  writeHandoffs(
    readHandoffsSnapshot().map((handoff) =>
      handoff.id === handoffId
        ? {
            ...handoff,
            handoffNote: handoffNote?.trim() || null,
            outgoingAcknowledged: true,
          }
        : handoff,
    ),
  );
}

export function acceptTemporaryHandoff(handoffId: string) {
  writeHandoffs(
    readHandoffsSnapshot().map((handoff) =>
      handoff.id === handoffId
        ? { ...handoff, incomingAccepted: true }
        : handoff,
    ),
  );
}

export function removeTemporaryHandoffsForShow(showId: string) {
  writeHandoffs(
    readHandoffsSnapshot().filter((handoff) => handoff.showId !== showId),
  );
}
