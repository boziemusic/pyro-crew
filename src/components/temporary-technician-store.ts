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

const ADDITIONAL_STORAGE_KEY =
  "pyro-crew-temporary-additional-technician-assignments";
const ADDITIONAL_STORE_EVENT =
  "pyro-crew-temporary-additional-technician-assignments-change";
const ADDITIONAL_ASSIGNMENT_TIME_STORAGE_KEY =
  "pyro-crew-temporary-additional-technician-assignment-times";
const SELECTED_TECHNICIAN_STORAGE_KEY =
  "pyro-crew-selected-temporary-technician";
const SELECTED_TECHNICIAN_STORE_EVENT =
  "pyro-crew-selected-temporary-technician-change";
const EMPTY_ASSIGNMENTS: TemporaryTechnicianAssignments = {};
const EMPTY_ASSIGNMENT_TIMES: TemporaryAssignmentTimes = {};
const DEFAULT_SELECTED_TECHNICIAN: TemporaryTechnicianId = "tech_1";

let cachedAdditionalStorageValue: string | null = null;
let cachedAdditionalAssignments = EMPTY_ASSIGNMENTS;
let cachedAdditionalAssignmentTimeStorageValue: string | null = null;
let cachedAdditionalAssignmentTimes = EMPTY_ASSIGNMENT_TIMES;
let cachedSelectedTechnician: TemporaryTechnicianId =
  DEFAULT_SELECTED_TECHNICIAN;

function isTemporaryTechnicianId(
  value: unknown,
): value is TemporaryTechnicianId {
  return TEMPORARY_TECHNICIANS.some(
    (technician) => technician.id === value,
  );
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

function readSelectedTechnicianSnapshot() {
  if (typeof window === "undefined") {
    return DEFAULT_SELECTED_TECHNICIAN;
  }

  const stored = window.localStorage.getItem(
    SELECTED_TECHNICIAN_STORAGE_KEY,
  );

  cachedSelectedTechnician = isTemporaryTechnicianId(stored)
    ? stored
    : DEFAULT_SELECTED_TECHNICIAN;

  return cachedSelectedTechnician;
}

function subscribeToSelectedTechnician(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(SELECTED_TECHNICIAN_STORE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(
      SELECTED_TECHNICIAN_STORE_EVENT,
      onStoreChange,
    );
  };
}

function readAdditionalAssignmentTimesSnapshot() {
  if (typeof window === "undefined") {
    return EMPTY_ASSIGNMENT_TIMES;
  }

  const stored = window.localStorage.getItem(
    ADDITIONAL_ASSIGNMENT_TIME_STORAGE_KEY,
  );

  if (!stored) {
    cachedAdditionalAssignmentTimeStorageValue = null;
    cachedAdditionalAssignmentTimes = EMPTY_ASSIGNMENT_TIMES;
    return cachedAdditionalAssignmentTimes;
  }

  if (stored === cachedAdditionalAssignmentTimeStorageValue) {
    return cachedAdditionalAssignmentTimes;
  }

  try {
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    const times = Object.fromEntries(
      Object.entries(parsed).filter(
        ([, value]) => typeof value === "string",
      ),
    ) as TemporaryAssignmentTimes;

    cachedAdditionalAssignmentTimeStorageValue = stored;
    cachedAdditionalAssignmentTimes = times;
    return times;
  } catch {
    window.localStorage.removeItem(
      ADDITIONAL_ASSIGNMENT_TIME_STORAGE_KEY,
    );
    cachedAdditionalAssignmentTimeStorageValue = null;
    cachedAdditionalAssignmentTimes = EMPTY_ASSIGNMENT_TIMES;
    return cachedAdditionalAssignmentTimes;
  }
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
    readAdditionalAssignmentTimesSnapshot,
    () => EMPTY_ASSIGNMENT_TIMES,
  );
}

export function useSelectedTemporaryTechnician() {
  return useSyncExternalStore(
    subscribeToSelectedTechnician,
    readSelectedTechnicianSnapshot,
    () => DEFAULT_SELECTED_TECHNICIAN,
  );
}

export function setSelectedTemporaryTechnician(
  technicianId: TemporaryTechnicianId,
) {
  window.localStorage.setItem(
    SELECTED_TECHNICIAN_STORAGE_KEY,
    technicianId,
  );
  cachedSelectedTechnician = technicianId;
  window.dispatchEvent(new Event(SELECTED_TECHNICIAN_STORE_EVENT));
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
    ...readAdditionalAssignmentTimesSnapshot(),
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

export function removeTemporaryTechnicianData(issueIds: string[]) {
  const issueIdSet = new Set(issueIds);
  const additionalAssignments = Object.fromEntries(
    Object.entries(readAdditionalAssignmentsSnapshot()).filter(
      ([issueId]) => !issueIdSet.has(issueId),
    ),
  ) as TemporaryTechnicianAssignments;
  const additionalAssignmentTimes = Object.fromEntries(
    Object.entries(
      readAdditionalAssignmentTimesSnapshot(),
    ).filter(([issueId]) => !issueIdSet.has(issueId)),
  ) as TemporaryAssignmentTimes;
  const serializedAdditionalAssignments = JSON.stringify(
    additionalAssignments,
  );
  const serializedAdditionalAssignmentTimes = JSON.stringify(
    additionalAssignmentTimes,
  );

  window.localStorage.setItem(
    ADDITIONAL_STORAGE_KEY,
    serializedAdditionalAssignments,
  );
  window.localStorage.setItem(
    ADDITIONAL_ASSIGNMENT_TIME_STORAGE_KEY,
    serializedAdditionalAssignmentTimes,
  );
  cachedAdditionalStorageValue = serializedAdditionalAssignments;
  cachedAdditionalAssignments = additionalAssignments;
  cachedAdditionalAssignmentTimeStorageValue =
    serializedAdditionalAssignmentTimes;
  cachedAdditionalAssignmentTimes = additionalAssignmentTimes;
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
