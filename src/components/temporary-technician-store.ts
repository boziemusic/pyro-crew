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

const SELECTED_TECHNICIAN_STORAGE_KEY =
  "pyro-crew-selected-temporary-technician";
const SELECTED_TECHNICIAN_STORE_EVENT =
  "pyro-crew-selected-temporary-technician-change";
const DEFAULT_SELECTED_TECHNICIAN: TemporaryTechnicianId = "tech_1";

let cachedSelectedTechnician: TemporaryTechnicianId =
  DEFAULT_SELECTED_TECHNICIAN;

function isTemporaryTechnicianId(
  value: unknown,
): value is TemporaryTechnicianId {
  return TEMPORARY_TECHNICIANS.some(
    (technician) => technician.id === value,
  );
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

export function getTemporaryTechnicianLabel(
  technicianId: TemporaryTechnicianId | undefined,
) {
  return (
    TEMPORARY_TECHNICIANS.find(
      (technician) => technician.id === technicianId,
    )?.label ?? "Unassigned"
  );
}
