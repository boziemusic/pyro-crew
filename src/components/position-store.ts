"use client";

import { useCallback, useSyncExternalStore } from "react";

export type PositionGroup = {
  id: string;
  name: string;
  createdAt: string;
};

export type FieldPosition = {
  id: string;
  groupId: string | null;
  name: string;
  createdAt: string;
};

type ShowPositionData = {
  groups: PositionGroup[];
  positions: FieldPosition[];
};

type PositionStore = Record<string, ShowPositionData>;

const STORAGE_KEY = "pyro-crew-show-positions";
const STORE_EVENT = "pyro-crew-show-positions-change";
const EMPTY_SHOW_DATA: ShowPositionData = {
  groups: [],
  positions: [],
};

let cachedStorageValue: string | null = null;
let cachedStore: PositionStore = {};

function createId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readStoreSnapshot() {
  if (typeof window === "undefined") {
    return cachedStore;
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);

  if (!stored) {
    cachedStorageValue = null;
    cachedStore = {};
    return cachedStore;
  }

  if (stored === cachedStorageValue) {
    return cachedStore;
  }

  try {
    cachedStorageValue = stored;
    cachedStore = JSON.parse(stored) as PositionStore;
    return cachedStore;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    cachedStorageValue = null;
    cachedStore = {};
    return cachedStore;
  }
}

function subscribeToPositionStore(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(STORE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(STORE_EVENT, onStoreChange);
  };
}

function writeShowData(showId: string, showData: ShowPositionData) {
  const nextStore = {
    ...readStoreSnapshot(),
    [showId]: showData,
  };
  const serialized = JSON.stringify(nextStore);

  window.localStorage.setItem(STORAGE_KEY, serialized);
  cachedStorageValue = serialized;
  cachedStore = nextStore;
  window.dispatchEvent(new Event(STORE_EVENT));
}

export function useShowPositions(showId: string | undefined) {
  const getSnapshot = useCallback(
    () =>
      showId
        ? readStoreSnapshot()[showId] ?? EMPTY_SHOW_DATA
        : EMPTY_SHOW_DATA,
    [showId],
  );

  return useSyncExternalStore(
    subscribeToPositionStore,
    getSnapshot,
    () => EMPTY_SHOW_DATA,
  );
}

export function createPositionGroup(showId: string, name: string) {
  const current = readStoreSnapshot()[showId] ?? EMPTY_SHOW_DATA;
  const group: PositionGroup = {
    id: createId(),
    name: name.trim(),
    createdAt: new Date().toISOString(),
  };

  writeShowData(showId, {
    ...current,
    groups: [...current.groups, group],
  });
}

export function renamePositionGroup(
  showId: string,
  groupId: string,
  name: string,
) {
  const current = readStoreSnapshot()[showId] ?? EMPTY_SHOW_DATA;

  writeShowData(showId, {
    ...current,
    groups: current.groups.map((group) =>
      group.id === groupId ? { ...group, name: name.trim() } : group,
    ),
  });
}

export function deletePositionGroup(showId: string, groupId: string) {
  const current = readStoreSnapshot()[showId] ?? EMPTY_SHOW_DATA;

  writeShowData(showId, {
    groups: current.groups.filter((group) => group.id !== groupId),
    positions: current.positions.map((position) =>
      position.groupId === groupId
        ? { ...position, groupId: null }
        : position,
    ),
  });
}

export function createFieldPosition(
  showId: string,
  groupId: string | null,
  name: string,
) {
  const current = readStoreSnapshot()[showId] ?? EMPTY_SHOW_DATA;
  const position: FieldPosition = {
    id: createId(),
    groupId,
    name: name.trim(),
    createdAt: new Date().toISOString(),
  };

  writeShowData(showId, {
    ...current,
    positions: [...current.positions, position],
  });
}

export function moveFieldPosition(
  showId: string,
  positionId: string,
  groupId: string | null,
) {
  const current = readStoreSnapshot()[showId] ?? EMPTY_SHOW_DATA;

  writeShowData(showId, {
    ...current,
    positions: current.positions.map((position) =>
      position.id === positionId ? { ...position, groupId } : position,
    ),
  });
}

export function renameFieldPosition(
  showId: string,
  positionId: string,
  name: string,
) {
  const current = readStoreSnapshot()[showId] ?? EMPTY_SHOW_DATA;

  writeShowData(showId, {
    ...current,
    positions: current.positions.map((position) =>
      position.id === positionId
        ? { ...position, name: name.trim() }
        : position,
    ),
  });
}

export function deleteFieldPosition(showId: string, positionId: string) {
  const current = readStoreSnapshot()[showId] ?? EMPTY_SHOW_DATA;

  writeShowData(showId, {
    ...current,
    positions: current.positions.filter(
      (position) => position.id !== positionId,
    ),
  });
}

export function deleteShowPositionData(showId: string) {
  const nextStore = { ...readStoreSnapshot() };
  delete nextStore[showId];
  const serialized = JSON.stringify(nextStore);

  window.localStorage.setItem(STORAGE_KEY, serialized);
  cachedStorageValue = serialized;
  cachedStore = nextStore;
  window.dispatchEvent(new Event(STORE_EVENT));
}

// TODO(script import): populate groups and positions from imported show scripts.
// TODO(map placement): place groups and positions visually on a Google Maps field map.
// TODO(field zones): support team and technician assignment by field zone.
