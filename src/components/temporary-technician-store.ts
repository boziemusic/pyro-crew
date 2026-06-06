"use client";

import { useSyncExternalStore } from "react";

export const TEMPORARY_TECHNICIANS = [
  { id: "tech_1", label: "Tech 1" },
  { id: "tech_2", label: "Tech 2" },
  { id: "tech_3", label: "Tech 3" },
  { id: "tech_4", label: "Tech 4" },
] as const;

export type TemporaryTechnicianId =
  (typeof TEMPORARY_TECHNICIANS)[number]["id"];

type TemporaryTechnicianAssignments = Record<
  string,
  TemporaryTechnicianId
>;

const STORAGE_KEY = "pyro-crew-temporary-technician-assignments";
const STORE_EVENT = "pyro-crew-temporary-technician-assignments-change";
const ADDITIONAL_STORAGE_KEY =
  "pyro-crew-temporary-additional-technician-assignments";
const ADDITIONAL_STORE_EVENT =
  "pyro-crew-temporary-additional-technician-assignments-change";
const EMPTY_ASSIGNMENTS: TemporaryTechnicianAssignments = {};

let cachedStorageValue: string | null = null;
let cachedAssignments = EMPTY_ASSIGNMENTS;
let cachedAdditionalStorageValue: string | null = null;
let cachedAdditionalAssignments = EMPTY_ASSIGNMENTS;

function isTemporaryTechnicianId(
  value: unknown,
): value is TemporaryTechnicianId {
  return TEMPORARY_TECHNICIANS.some(
    (technician) => technician.id === value,
  );
}

function readAssignmentsSnapshot() {
  if (typeof window === "undefined") {
    return EMPTY_ASSIGNMENTS;
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);

  if (!stored) {
    cachedStorageValue = null;
    cachedAssignments = EMPTY_ASSIGNMENTS;
    return cachedAssignments;
  }

  if (stored === cachedStorageValue) {
    return cachedAssignments;
  }

  try {
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    cachedAssignments = Object.fromEntries(
      Object.entries(parsed).filter(([, value]) =>
        isTemporaryTechnicianId(value),
      ),
    ) as TemporaryTechnicianAssignments;
    cachedStorageValue = stored;
    return cachedAssignments;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    cachedStorageValue = null;
    cachedAssignments = EMPTY_ASSIGNMENTS;
    return cachedAssignments;
  }
}

function subscribeToAssignments(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(STORE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(STORE_EVENT, onStoreChange);
  };
}

function readAdditionalAssignmentsSnapshot() {
  if (typeof window === "undefined") {
    return EMPTY_ASSIGNMENTS;
  }

  const stored = window.localStorage.getItem(ADDITIONAL_STORAGE_KEY);

  if (!stored) {
    cachedAdditionalStorageValue = null;
    cachedAdditionalAssignments = EMPTY_ASSIGNMENTS;
    return cachedAdditionalAssignments;
  }

  if (stored === cachedAdditionalStorageValue) {
    return cachedAdditionalAssignments;
  }

  try {
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    cachedAdditionalAssignments = Object.fromEntries(
      Object.entries(parsed).filter(([, value]) =>
        isTemporaryTechnicianId(value),
      ),
    ) as TemporaryTechnicianAssignments;
    cachedAdditionalStorageValue = stored;
    return cachedAdditionalAssignments;
  } catch {
    window.localStorage.removeItem(ADDITIONAL_STORAGE_KEY);
    cachedAdditionalStorageValue = null;
    cachedAdditionalAssignments = EMPTY_ASSIGNMENTS;
    return cachedAdditionalAssignments;
  }
}

function subscribeToAdditionalAssignments(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(ADDITIONAL_STORE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(ADDITIONAL_STORE_EVENT, onStoreChange);
  };
}

export function useTemporaryTechnicianAssignments() {
  return useSyncExternalStore(
    subscribeToAssignments,
    readAssignmentsSnapshot,
    () => EMPTY_ASSIGNMENTS,
  );
}

export function useTemporaryAdditionalTechnicianAssignments() {
  return useSyncExternalStore(
    subscribeToAdditionalAssignments,
    readAdditionalAssignmentsSnapshot,
    () => EMPTY_ASSIGNMENTS,
  );
}

export function setTemporaryTechnicianAssignment(
  issueId: string,
  technicianId: TemporaryTechnicianId | null,
) {
  const assignments = { ...readAssignmentsSnapshot() };

  if (technicianId) {
    assignments[issueId] = technicianId;
  } else {
    delete assignments[issueId];
  }

  const serialized = JSON.stringify(assignments);
  window.localStorage.setItem(STORAGE_KEY, serialized);
  cachedStorageValue = serialized;
  cachedAssignments = assignments;
  window.dispatchEvent(new Event(STORE_EVENT));
}

export function setTemporaryAdditionalTechnicianAssignment(
  issueId: string,
  technicianId: TemporaryTechnicianId,
) {
  const assignments = {
    ...readAdditionalAssignmentsSnapshot(),
    [issueId]: technicianId,
  };
  const serialized = JSON.stringify(assignments);

  window.localStorage.setItem(ADDITIONAL_STORAGE_KEY, serialized);
  cachedAdditionalStorageValue = serialized;
  cachedAdditionalAssignments = assignments;
  window.dispatchEvent(new Event(ADDITIONAL_STORE_EVENT));
}

export function getTemporaryTechnicianLabel(
  technicianId: TemporaryTechnicianId | undefined,
) {
  return (
    TEMPORARY_TECHNICIANS.find(
      (technician) => technician.id === technicianId,
    )?.label ?? "Unassigned"
  );
}
