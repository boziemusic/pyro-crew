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
type TemporaryAssignmentTimes = Record<string, string>;

const STORAGE_KEY = "pyro-crew-temporary-technician-assignments";
const STORE_EVENT = "pyro-crew-temporary-technician-assignments-change";
const ASSIGNMENT_TIME_STORAGE_KEY =
  "pyro-crew-temporary-technician-assignment-times";
const ADDITIONAL_STORAGE_KEY =
  "pyro-crew-temporary-additional-technician-assignments";
const ADDITIONAL_STORE_EVENT =
  "pyro-crew-temporary-additional-technician-assignments-change";
const ADDITIONAL_ASSIGNMENT_TIME_STORAGE_KEY =
  "pyro-crew-temporary-additional-technician-assignment-times";
const EMPTY_ASSIGNMENTS: TemporaryTechnicianAssignments = {};
const EMPTY_ASSIGNMENT_TIMES: TemporaryAssignmentTimes = {};

let cachedStorageValue: string | null = null;
let cachedAssignments = EMPTY_ASSIGNMENTS;
let cachedAssignmentTimeStorageValue: string | null = null;
let cachedAssignmentTimes = EMPTY_ASSIGNMENT_TIMES;
let cachedAdditionalStorageValue: string | null = null;
let cachedAdditionalAssignments = EMPTY_ASSIGNMENTS;
let cachedAdditionalAssignmentTimeStorageValue: string | null = null;
let cachedAdditionalAssignmentTimes = EMPTY_ASSIGNMENT_TIMES;

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

function readAssignmentTimesSnapshot(
  storageKey: string,
  additional = false,
) {
  if (typeof window === "undefined") {
    return EMPTY_ASSIGNMENT_TIMES;
  }

  const stored = window.localStorage.getItem(storageKey);
  const cachedValue = additional
    ? cachedAdditionalAssignmentTimeStorageValue
    : cachedAssignmentTimeStorageValue;

  if (!stored) {
    if (additional) {
      cachedAdditionalAssignmentTimeStorageValue = null;
      cachedAdditionalAssignmentTimes = EMPTY_ASSIGNMENT_TIMES;
      return cachedAdditionalAssignmentTimes;
    }

    cachedAssignmentTimeStorageValue = null;
    cachedAssignmentTimes = EMPTY_ASSIGNMENT_TIMES;
    return cachedAssignmentTimes;
  }

  if (stored === cachedValue) {
    return additional
      ? cachedAdditionalAssignmentTimes
      : cachedAssignmentTimes;
  }

  try {
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    const times = Object.fromEntries(
      Object.entries(parsed).filter(
        ([, value]) => typeof value === "string",
      ),
    ) as TemporaryAssignmentTimes;

    if (additional) {
      cachedAdditionalAssignmentTimeStorageValue = stored;
      cachedAdditionalAssignmentTimes = times;
    } else {
      cachedAssignmentTimeStorageValue = stored;
      cachedAssignmentTimes = times;
    }

    return times;
  } catch {
    window.localStorage.removeItem(storageKey);

    if (additional) {
      cachedAdditionalAssignmentTimeStorageValue = null;
      cachedAdditionalAssignmentTimes = EMPTY_ASSIGNMENT_TIMES;
      return cachedAdditionalAssignmentTimes;
    }

    cachedAssignmentTimeStorageValue = null;
    cachedAssignmentTimes = EMPTY_ASSIGNMENT_TIMES;
    return cachedAssignmentTimes;
  }
}

export function useTemporaryTechnicianAssignments() {
  return useSyncExternalStore(
    subscribeToAssignments,
    readAssignmentsSnapshot,
    () => EMPTY_ASSIGNMENTS,
  );
}

export function useTemporaryTechnicianAssignmentTimes() {
  return useSyncExternalStore(
    subscribeToAssignments,
    () => readAssignmentTimesSnapshot(ASSIGNMENT_TIME_STORAGE_KEY),
    () => EMPTY_ASSIGNMENT_TIMES,
  );
}

export function useTemporaryAdditionalTechnicianAssignments() {
  return useSyncExternalStore(
    subscribeToAdditionalAssignments,
    readAdditionalAssignmentsSnapshot,
    () => EMPTY_ASSIGNMENTS,
  );
}

export function useTemporaryAdditionalTechnicianAssignmentTimes() {
  return useSyncExternalStore(
    subscribeToAdditionalAssignments,
    () =>
      readAssignmentTimesSnapshot(
        ADDITIONAL_ASSIGNMENT_TIME_STORAGE_KEY,
        true,
      ),
    () => EMPTY_ASSIGNMENT_TIMES,
  );
}

export function setTemporaryTechnicianAssignment(
  issueId: string,
  technicianId: TemporaryTechnicianId | null,
) {
  const assignments = { ...readAssignmentsSnapshot() };
  const assignmentTimes = {
    ...readAssignmentTimesSnapshot(ASSIGNMENT_TIME_STORAGE_KEY),
  };

  if (technicianId) {
    assignments[issueId] = technicianId;
    assignmentTimes[issueId] = new Date().toISOString();
  } else {
    delete assignments[issueId];
    delete assignmentTimes[issueId];
  }

  const serialized = JSON.stringify(assignments);
  const serializedTimes = JSON.stringify(assignmentTimes);
  window.localStorage.setItem(STORAGE_KEY, serialized);
  window.localStorage.setItem(
    ASSIGNMENT_TIME_STORAGE_KEY,
    serializedTimes,
  );
  cachedStorageValue = serialized;
  cachedAssignments = assignments;
  cachedAssignmentTimeStorageValue = serializedTimes;
  cachedAssignmentTimes = assignmentTimes;
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
  const assignmentTimes = {
    ...readAssignmentTimesSnapshot(
      ADDITIONAL_ASSIGNMENT_TIME_STORAGE_KEY,
      true,
    ),
    [issueId]: new Date().toISOString(),
  };
  const serialized = JSON.stringify(assignments);
  const serializedTimes = JSON.stringify(assignmentTimes);

  window.localStorage.setItem(ADDITIONAL_STORAGE_KEY, serialized);
  window.localStorage.setItem(
    ADDITIONAL_ASSIGNMENT_TIME_STORAGE_KEY,
    serializedTimes,
  );
  cachedAdditionalStorageValue = serialized;
  cachedAdditionalAssignments = assignments;
  cachedAdditionalAssignmentTimeStorageValue = serializedTimes;
  cachedAdditionalAssignmentTimes = assignmentTimes;
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
