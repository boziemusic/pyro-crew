"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export type FieldMapMarker = {
  entityType: "group" | "position";
  markerName: string;
  x: number;
  y: number;
};

export type FieldMapData = {
  error: string | null;
  imageAspectRatio: number;
  imageName: string;
  imageUrl: string;
  isLoading: boolean;
  markers: FieldMapMarker[];
};

export type FieldMapState = FieldMapData & {
  placeMarkersOptimistically: (
    markers: FieldMapMarker[],
  ) => Promise<void>;
  removeMarkersOptimistically: (
    markers: FieldMapMarker[],
  ) => Promise<void>;
};

type FieldMapMarkerRow = {
  id: string;
  marker_name: string;
  marker_type: FieldMapMarker["entityType"];
  x_percent: number | string;
  y_percent: number | string;
};

type ShowFieldMapRow = {
  field_map_image_path: string | null;
  field_map_uploaded_at: string | null;
};

type FieldMapMutationResult = {
  warning: string | null;
};

const FIELD_MAP_BUCKET = "field-maps";
const LEGACY_STORAGE_KEY = "pyro-crew-field-maps";
const STORE_EVENT = "pyro-crew-field-maps-change";
const DEFAULT_ASPECT_RATIO = 16 / 9;
const EMPTY_FIELD_MAP: FieldMapData = {
  error: null,
  imageAspectRatio: DEFAULT_ASPECT_RATIO,
  imageName: "",
  imageUrl: "",
  isLoading: false,
  markers: [],
};

function markerNameKey(name: string) {
  return name.trim().toLocaleLowerCase();
}

function markerKey(marker: FieldMapMarker) {
  return `${marker.entityType}:${markerNameKey(marker.markerName)}`;
}

function replaceMarkers(
  currentMarkers: FieldMapMarker[],
  nextMarkers: FieldMapMarker[],
) {
  const nextMarkerKeys = new Set(nextMarkers.map(markerKey));

  return [
    ...currentMarkers.filter(
      (marker) => !nextMarkerKeys.has(markerKey(marker)),
    ),
    ...nextMarkers,
  ];
}

function removeMarkers(
  currentMarkers: FieldMapMarker[],
  markersToRemove: FieldMapMarker[],
) {
  const markerKeysToRemove = new Set(markersToRemove.map(markerKey));

  return currentMarkers.filter(
    (marker) => !markerKeysToRemove.has(markerKey(marker)),
  );
}

export function notifyFieldMapChanged(showId: string) {
  window.dispatchEvent(
    new CustomEvent(STORE_EVENT, { detail: { showId } }),
  );
}

function getImageName(path: string) {
  return path.split("/").pop() ?? "Field map";
}

function sanitizeFilename(filename: string) {
  const sanitized = filename
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized || "field-map";
}

function loadImageAspectRatio(imageUrl: string) {
  return new Promise<number>((resolve) => {
    const image = new Image();

    image.onerror = () => resolve(DEFAULT_ASPECT_RATIO);
    image.onload = () =>
      resolve(
        image.naturalHeight > 0
          ? image.naturalWidth / image.naturalHeight
          : DEFAULT_ASPECT_RATIO,
      );
    image.src = imageUrl;
  });
}

async function loadFieldMap(showId: string): Promise<FieldMapData> {
  const supabase = createSupabaseBrowserClient();
  const [showResult, markerResult] = await Promise.all([
    supabase
      .from("shows")
      .select("field_map_image_path, field_map_uploaded_at")
      .eq("id", showId)
      .single(),
    supabase
      .from("field_map_markers")
      .select(
        "id, marker_type, marker_name, x_percent, y_percent",
      )
      .eq("show_id", showId)
      .order("created_at", { ascending: true }),
  ]);

  if (showResult.error) {
    throw new Error(
      `Field map metadata could not be loaded: ${showResult.error.message}`,
    );
  }

  if (markerResult.error) {
    throw new Error(
      `Field map markers could not be loaded: ${markerResult.error.message}`,
    );
  }

  const show = showResult.data as ShowFieldMapRow;
  const markerRows = (markerResult.data ?? []) as FieldMapMarkerRow[];
  let imageUrl = "";
  let imageName = "";
  let imageAspectRatio = DEFAULT_ASPECT_RATIO;

  if (show.field_map_image_path) {
    const signedUrlResult = await supabase.storage
      .from(FIELD_MAP_BUCKET)
      .createSignedUrl(show.field_map_image_path, 60 * 60);

    if (signedUrlResult.error) {
      throw new Error(
        `Field map image could not be loaded: ${signedUrlResult.error.message}`,
      );
    }

    imageUrl = signedUrlResult.data.signedUrl;
    imageName = getImageName(show.field_map_image_path);
    imageAspectRatio = await loadImageAspectRatio(imageUrl);
  }

  const markersByKey = new Map<string, FieldMapMarker>();

  markerRows.forEach((row) => {
    if (row.marker_type !== "group" && row.marker_type !== "position") {
      return;
    }

    const marker: FieldMapMarker = {
      entityType: row.marker_type,
      markerName: row.marker_name,
      x: Number(row.x_percent),
      y: Number(row.y_percent),
    };

    if (
      marker.markerName.trim() &&
      Number.isFinite(marker.x) &&
      Number.isFinite(marker.y)
    ) {
      markersByKey.set(markerKey(marker), marker);
    }
  });

  return {
    error: null,
    imageAspectRatio,
    imageName,
    imageUrl,
    isLoading: false,
    markers: Array.from(markersByKey.values()),
  };
}

export function useFieldMap(showId: string | undefined) {
  const [fieldMap, setFieldMap] = useState<FieldMapData>(EMPTY_FIELD_MAP);
  const fieldMapRef = useRef<FieldMapData>(EMPTY_FIELD_MAP);
  const requestIdRef = useRef(0);

  const updateFieldMap = useCallback(
    (
      update:
        | FieldMapData
        | ((current: FieldMapData) => FieldMapData),
    ) => {
      setFieldMap((current) => {
        const next =
          typeof update === "function" ? update(current) : update;

        fieldMapRef.current = next;
        return next;
      });
    },
    [],
  );

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    if (!showId) {
      updateFieldMap(EMPTY_FIELD_MAP);
      return;
    }

    updateFieldMap((current) => ({
      ...current,
      error: null,
      isLoading: true,
    }));

    try {
      const nextFieldMap = await loadFieldMap(showId);

      if (requestId === requestIdRef.current) {
        updateFieldMap(nextFieldMap);
      }
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      updateFieldMap((current) => ({
        ...current,
        error:
          error instanceof Error
            ? error.message
            : "The field map could not be loaded.",
        isLoading: false,
      }));
    }
  }, [showId, updateFieldMap]);

  useEffect(() => {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!showId) {
      return;
    }

    const handleStoreChange = (event: Event) => {
      const changedShowId = (event as CustomEvent<{ showId?: string }>).detail
        ?.showId;

      if (!changedShowId || changedShowId === showId) {
        void refresh();
      }
    };

    window.addEventListener(STORE_EVENT, handleStoreChange);
    return () => window.removeEventListener(STORE_EVENT, handleStoreChange);
  }, [refresh, showId]);

  const placeMarkersOptimistically = useCallback(
    async (markers: FieldMapMarker[]) => {
      if (!showId || markers.length === 0) {
        return;
      }

      const markerKeys = new Set(markers.map(markerKey));
      const previousMarkers = fieldMapRef.current.markers.filter((marker) =>
        markerKeys.has(markerKey(marker)),
      );

      updateFieldMap((current) => ({
        ...current,
        markers: replaceMarkers(current.markers, markers),
      }));

      try {
        await persistFieldMapMarkers(showId, markers);
      } catch (error) {
        updateFieldMap((current) => ({
          ...current,
          markers: replaceMarkers(
            removeMarkers(current.markers, markers),
            previousMarkers,
          ),
        }));

        try {
          await restorePersistedMarkers(
            showId,
            markers,
            previousMarkers,
          );
        } catch (rollbackError) {
          throw new Error(
            `${error instanceof Error ? error.message : "Marker changes could not be saved."} The database rollback also failed: ${
              rollbackError instanceof Error
                ? rollbackError.message
                : "Unknown rollback error"
            }`,
          );
        }

        throw error;
      }
    },
    [showId, updateFieldMap],
  );

  const removeMarkersOptimistically = useCallback(
    async (markers: FieldMapMarker[]) => {
      if (!showId || markers.length === 0) {
        return;
      }

      const markerKeys = new Set(markers.map(markerKey));
      const previousMarkers = fieldMapRef.current.markers.filter((marker) =>
        markerKeys.has(markerKey(marker)),
      );

      updateFieldMap((current) => ({
        ...current,
        markers: removeMarkers(current.markers, markers),
      }));

      try {
        await persistRemovedFieldMapMarkers(showId, markers);
      } catch (error) {
        updateFieldMap((current) => ({
          ...current,
          markers: replaceMarkers(current.markers, previousMarkers),
        }));

        try {
          await persistFieldMapMarkers(showId, previousMarkers);
        } catch (rollbackError) {
          throw new Error(
            `${error instanceof Error ? error.message : "Markers could not be removed."} The database rollback also failed: ${
              rollbackError instanceof Error
                ? rollbackError.message
                : "Unknown rollback error"
            }`,
          );
        }

        throw error;
      }
    },
    [showId, updateFieldMap],
  );

  return {
    ...fieldMap,
    placeMarkersOptimistically,
    removeMarkersOptimistically,
  } satisfies FieldMapState;
}

export async function saveFieldMapImage(
  showId: string,
  file: File,
): Promise<FieldMapMutationResult> {
  const supabase = createSupabaseBrowserClient();
  const currentShowResult = await supabase
    .from("shows")
    .select("field_map_image_path")
    .eq("id", showId)
    .single();

  if (currentShowResult.error) {
    throw new Error(
      `Current field map metadata could not be loaded: ${currentShowResult.error.message}`,
    );
  }

  const previousPath = currentShowResult.data.field_map_image_path as
    | string
    | null;
  const nextPath = `${showId}/${crypto.randomUUID()}/${sanitizeFilename(file.name)}`;
  const uploadResult = await supabase.storage
    .from(FIELD_MAP_BUCKET)
    .upload(nextPath, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });

  if (uploadResult.error) {
    throw new Error(
      `Field map image upload failed: ${uploadResult.error.message}`,
    );
  }

  const uploadedAt = new Date().toISOString();
  const metadataResult = await supabase
    .from("shows")
    .update({
      field_map_image_path: nextPath,
      field_map_uploaded_at: uploadedAt,
    })
    .eq("id", showId);

  if (metadataResult.error) {
    await supabase.storage.from(FIELD_MAP_BUCKET).remove([nextPath]);
    throw new Error(
      `Field map metadata could not be saved: ${metadataResult.error.message}`,
    );
  }

  let warning: string | null = null;

  if (previousPath && previousPath !== nextPath) {
    const removeResult = await supabase.storage
      .from(FIELD_MAP_BUCKET)
      .remove([previousPath]);

    if (removeResult.error) {
      warning = `The new field map was saved, but the previous Storage object could not be removed: ${removeResult.error.message}`;
    }
  }

  notifyFieldMapChanged(showId);
  return { warning };
}

async function saveMarker(
  showId: string,
  marker: FieldMapMarker,
) {
  const supabase = createSupabaseBrowserClient();
  const existingResult = await supabase
    .from("field_map_markers")
    .select("id, marker_name")
    .eq("show_id", showId)
    .eq("marker_type", marker.entityType);

  if (existingResult.error) {
    throw new Error(
      `Existing marker could not be checked: ${existingResult.error.message}`,
    );
  }

  const existingMarkers = (existingResult.data ?? []).filter(
    (row) =>
      markerNameKey(row.marker_name) === markerNameKey(marker.markerName),
  );
  const values = {
    marker_name: marker.markerName.trim(),
    marker_type: marker.entityType,
    updated_at: new Date().toISOString(),
    x_percent: marker.x,
    y_percent: marker.y,
  };
  const saveResult = existingMarkers.length > 0
    ? await supabase
        .from("field_map_markers")
        .update(values)
        .in(
          "id",
          existingMarkers.map((existingMarker) => existingMarker.id),
        )
    : await supabase
        .from("field_map_markers")
        .insert({ ...values, show_id: showId });

  if (saveResult.error) {
    throw new Error(
      `Marker ${marker.markerName} could not be saved: ${saveResult.error.message}`,
    );
  }
}

async function persistFieldMapMarkers(
  showId: string,
  markers: FieldMapMarker[],
) {
  for (const marker of markers) {
    await saveMarker(showId, marker);
  }
}

async function restorePersistedMarkers(
  showId: string,
  attemptedMarkers: FieldMapMarker[],
  previousMarkers: FieldMapMarker[],
) {
  const previousMarkerKeys = new Set(previousMarkers.map(markerKey));
  const newlyPlacedMarkers = attemptedMarkers.filter(
    (marker) => !previousMarkerKeys.has(markerKey(marker)),
  );

  await persistFieldMapMarkers(showId, previousMarkers);
  await persistRemovedFieldMapMarkers(showId, newlyPlacedMarkers);
}

async function persistRemovedFieldMapMarkers(
  showId: string,
  markers: FieldMapMarker[],
) {
  const supabase = createSupabaseBrowserClient();

  for (const marker of markers) {
    const existingResult = await supabase
      .from("field_map_markers")
      .select("id, marker_name")
      .eq("show_id", showId)
      .eq("marker_type", marker.entityType);

    if (existingResult.error) {
      throw new Error(
        `Marker ${marker.markerName} could not be found: ${existingResult.error.message}`,
      );
    }

    const markerIds = (existingResult.data ?? [])
      .filter(
        (row) =>
          markerNameKey(row.marker_name) ===
          markerNameKey(marker.markerName),
      )
      .map((row) => row.id);

    if (markerIds.length === 0) {
      continue;
    }

    const result = await supabase
      .from("field_map_markers")
      .delete()
      .in("id", markerIds);

    if (result.error) {
      throw new Error(
        `Marker ${marker.markerName} could not be removed: ${result.error.message}`,
      );
    }
  }
}

export async function clearFieldMapImage(
  showId: string,
): Promise<FieldMapMutationResult> {
  const supabase = createSupabaseBrowserClient();
  const currentShowResult = await supabase
    .from("shows")
    .select("field_map_image_path")
    .eq("id", showId)
    .single();

  if (currentShowResult.error) {
    throw new Error(
      `Current field map metadata could not be loaded: ${currentShowResult.error.message}`,
    );
  }

  const imagePath = currentShowResult.data.field_map_image_path as
    | string
    | null;
  const metadataResult = await supabase
    .from("shows")
    .update({
      field_map_image_path: null,
      field_map_uploaded_at: null,
    })
    .eq("id", showId);

  if (metadataResult.error) {
    throw new Error(
      `Field map metadata could not be cleared: ${metadataResult.error.message}`,
    );
  }

  let warning: string | null = null;

  if (imagePath) {
    const removeResult = await supabase.storage
      .from(FIELD_MAP_BUCKET)
      .remove([imagePath]);

    if (removeResult.error) {
      warning = `The field map was cleared, but its Storage object could not be removed: ${removeResult.error.message}`;
    }
  }

  notifyFieldMapChanged(showId);
  return { warning };
}

// TODO(google maps): support Google Maps as an optional future field-map provider.
