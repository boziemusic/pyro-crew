"use client";

import { useCallback, useSyncExternalStore } from "react";

export type FieldMapMarker = {
  entityId: string;
  entityType: "group" | "position";
  x: number;
  y: number;
};

export type FieldMapData = {
  imageDataUrl: string;
  imageName: string;
  imageAspectRatio: number;
  markers: FieldMapMarker[];
};

type FieldMapStore = Record<string, FieldMapData>;

const STORAGE_KEY = "pyro-crew-field-maps";
const STORE_EVENT = "pyro-crew-field-maps-change";
const EMPTY_FIELD_MAP: FieldMapData = {
  imageDataUrl: "",
  imageName: "",
  imageAspectRatio: 16 / 9,
  markers: [],
};

let cachedStorageValue: string | null = null;
let cachedStore: FieldMapStore = {};

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
    cachedStore = JSON.parse(stored) as FieldMapStore;
    return cachedStore;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    cachedStorageValue = null;
    cachedStore = {};
    return cachedStore;
  }
}

function subscribeToFieldMapStore(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(STORE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(STORE_EVENT, onStoreChange);
  };
}

function writeStore(nextStore: FieldMapStore) {
  const serialized = JSON.stringify(nextStore);

  window.localStorage.setItem(STORAGE_KEY, serialized);
  cachedStorageValue = serialized;
  cachedStore = nextStore;
  window.dispatchEvent(new Event(STORE_EVENT));
}

function writeShowMap(showId: string, fieldMap: FieldMapData) {
  writeStore({
    ...readStoreSnapshot(),
    [showId]: fieldMap,
  });
}

export function useFieldMap(showId: string | undefined) {
  const getSnapshot = useCallback(
    () =>
      showId
        ? readStoreSnapshot()[showId] ?? EMPTY_FIELD_MAP
        : EMPTY_FIELD_MAP,
    [showId],
  );

  return useSyncExternalStore(
    subscribeToFieldMapStore,
    getSnapshot,
    () => EMPTY_FIELD_MAP,
  );
}

export function saveFieldMapImage(
  showId: string,
  image: Pick<
    FieldMapData,
    "imageAspectRatio" | "imageDataUrl" | "imageName"
  >,
) {
  const current = readStoreSnapshot()[showId] ?? EMPTY_FIELD_MAP;

  writeShowMap(showId, {
    ...current,
    ...image,
  });
}

export function placeFieldMapMarker(
  showId: string,
  marker: FieldMapMarker,
) {
  const current = readStoreSnapshot()[showId] ?? EMPTY_FIELD_MAP;
  const markers = current.markers.filter(
    (existingMarker) =>
      existingMarker.entityId !== marker.entityId ||
      existingMarker.entityType !== marker.entityType,
  );

  writeShowMap(showId, {
    ...current,
    markers: [...markers, marker],
  });
}

export function placeFieldMapMarkers(
  showId: string,
  nextMarkers: FieldMapMarker[],
) {
  const current = readStoreSnapshot()[showId] ?? EMPTY_FIELD_MAP;
  const nextMarkerKeys = new Set(
    nextMarkers.map(
      (marker) => `${marker.entityType}:${marker.entityId}`,
    ),
  );

  writeShowMap(showId, {
    ...current,
    markers: [
      ...current.markers.filter(
        (marker) =>
          !nextMarkerKeys.has(`${marker.entityType}:${marker.entityId}`),
      ),
      ...nextMarkers,
    ],
  });
}

export function removeFieldMapMarker(
  showId: string,
  entityType: FieldMapMarker["entityType"],
  entityId: string,
) {
  const current = readStoreSnapshot()[showId] ?? EMPTY_FIELD_MAP;

  writeShowMap(showId, {
    ...current,
    markers: current.markers.filter(
      (marker) =>
        marker.entityId !== entityId || marker.entityType !== entityType,
    ),
  });
}

export function removeFieldMapMarkers(
  showId: string,
  markerKeys: string[],
) {
  const current = readStoreSnapshot()[showId] ?? EMPTY_FIELD_MAP;
  const keysToRemove = new Set(markerKeys);

  writeShowMap(showId, {
    ...current,
    markers: current.markers.filter(
      (marker) =>
        !keysToRemove.has(`${marker.entityType}:${marker.entityId}`),
    ),
  });
}

export function clearFieldMap(showId: string) {
  const nextStore = { ...readStoreSnapshot() };
  delete nextStore[showId];
  writeStore(nextStore);
}

export function deleteShowFieldMapData(showId: string) {
  clearFieldMap(showId);
}

// TODO(google maps): support Google Maps as an optional future field-map provider.
// TODO(map persistence): move uploaded images and marker coordinates to durable storage.
