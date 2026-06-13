"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { notifyFieldMapChanged } from "@/components/field-map-store";
import { createSupabaseBrowserClient } from "@/lib/supabase";

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
  source: "manual" | "script_imported";
};

export type PositionImportSummary = {
  positionsFound: number;
  positionsImported: number;
  duplicatesSkipped: number;
  stalePositionsRemoved: number;
};

type ShowPositionData = {
  error: string | null;
  groups: PositionGroup[];
  isLoading: boolean;
  positions: FieldPosition[];
};

type PositionGroupRow = {
  created_at: string;
  id: string;
  name: string;
};

type PositionRow = {
  created_at: string;
  group_id: string | null;
  id: string;
  name: string;
  source: string;
};

const LEGACY_STORAGE_KEY = "pyro-crew-show-positions";
const STORE_EVENT = "pyro-crew-show-positions-change";
const EMPTY_SHOW_DATA: ShowPositionData = {
  error: null,
  groups: [],
  isLoading: false,
  positions: [],
};

function normalizeName(name: string) {
  return name.trim().toLocaleLowerCase();
}

function notifyPositionStoreChanged(showId: string) {
  window.dispatchEvent(
    new CustomEvent(STORE_EVENT, { detail: { showId } }),
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function renameFieldMapMarker(
  showId: string,
  markerType: "group" | "position",
  previousName: string,
  nextName: string,
) {
  const supabase = createSupabaseBrowserClient();
  const markerResult = await supabase
    .from("field_map_markers")
    .select("id, marker_name")
    .eq("show_id", showId)
    .eq("marker_type", markerType);

  if (markerResult.error) {
    throw new Error(
      `The ${markerType} was renamed, but its map marker could not be checked: ${markerResult.error.message}`,
    );
  }

  const markerIds = (markerResult.data ?? [])
    .filter(
      (marker) =>
        normalizeName(marker.marker_name) === normalizeName(previousName),
    )
    .map((marker) => marker.id);

  if (markerIds.length === 0) {
    return;
  }

  const updateResult = await supabase
    .from("field_map_markers")
    .update({
      marker_name: nextName.trim(),
      updated_at: new Date().toISOString(),
    })
    .in("id", markerIds);

  if (updateResult.error) {
    throw new Error(
      `The ${markerType} was renamed, but its map marker could not be updated: ${updateResult.error.message}`,
    );
  }

  notifyFieldMapChanged(showId);
}

async function loadShowPositions(
  showId: string,
): Promise<ShowPositionData> {
  const supabase = createSupabaseBrowserClient();
  const [groupResult, positionResult] = await Promise.all([
    supabase
      .from("position_groups")
      .select("id, name, created_at")
      .eq("show_id", showId)
      .order("name", { ascending: true }),
    supabase
      .from("positions")
      .select("id, group_id, name, source, created_at")
      .eq("show_id", showId)
      .order("name", { ascending: true }),
  ]);

  if (groupResult.error) {
    throw new Error(
      `Position groups could not be loaded: ${groupResult.error.message}`,
    );
  }

  if (positionResult.error) {
    throw new Error(
      `Positions could not be loaded: ${positionResult.error.message}`,
    );
  }

  return {
    error: null,
    groups: ((groupResult.data ?? []) as PositionGroupRow[]).map(
      (group) => ({
        createdAt: group.created_at,
        id: group.id,
        name: group.name,
      }),
    ),
    isLoading: false,
    positions: ((positionResult.data ?? []) as PositionRow[]).map(
      (position) => ({
        createdAt: position.created_at,
        groupId: position.group_id,
        id: position.id,
        name: position.name,
        source:
          position.source === "script_imported"
            ? "script_imported"
            : "manual",
      }),
    ),
  };
}

export function useShowPositions(showId: string | undefined) {
  const [showData, setShowData] =
    useState<ShowPositionData>(EMPTY_SHOW_DATA);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    if (!showId) {
      setShowData(EMPTY_SHOW_DATA);
      return;
    }

    setShowData((current) => ({
      ...current,
      error: null,
      isLoading: true,
    }));

    try {
      const nextShowData = await loadShowPositions(showId);

      if (requestId === requestIdRef.current) {
        setShowData(nextShowData);
      }
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setShowData((current) => ({
        ...current,
        error: getErrorMessage(
          error,
          "Position data could not be loaded.",
        ),
        isLoading: false,
      }));
    }
  }, [showId]);

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

  return showData;
}

export async function createPositionGroup(
  showId: string,
  name: string,
) {
  const supabase = createSupabaseBrowserClient();
  const result = await supabase.from("position_groups").insert({
    name: name.trim(),
    show_id: showId,
  });

  if (result.error) {
    throw new Error(
      `Position group could not be created: ${result.error.message}`,
    );
  }

  notifyPositionStoreChanged(showId);
}

export async function renamePositionGroup(
  showId: string,
  groupId: string,
  name: string,
) {
  const supabase = createSupabaseBrowserClient();
  const currentResult = await supabase
    .from("position_groups")
    .select("name")
    .eq("id", groupId)
    .eq("show_id", showId)
    .single();

  if (currentResult.error) {
    throw new Error(
      `Position group could not be loaded for renaming: ${currentResult.error.message}`,
    );
  }

  const trimmedName = name.trim();
  const result = await supabase
    .from("position_groups")
    .update({
      name: trimmedName,
      updated_at: new Date().toISOString(),
    })
    .eq("id", groupId)
    .eq("show_id", showId);

  if (result.error) {
    throw new Error(
      `Position group could not be renamed: ${result.error.message}`,
    );
  }

  try {
    await renameFieldMapMarker(
      showId,
      "group",
      currentResult.data.name,
      trimmedName,
    );
  } finally {
    notifyPositionStoreChanged(showId);
  }
}

export async function deletePositionGroup(
  showId: string,
  groupId: string,
) {
  const supabase = createSupabaseBrowserClient();
  const result = await supabase
    .from("position_groups")
    .delete()
    .eq("id", groupId)
    .eq("show_id", showId);

  if (result.error) {
    throw new Error(
      `Position group could not be deleted: ${result.error.message}`,
    );
  }

  notifyPositionStoreChanged(showId);
}

export async function createFieldPosition(
  showId: string,
  groupId: string | null,
  name: string,
) {
  const supabase = createSupabaseBrowserClient();
  const result = await supabase.from("positions").insert({
    group_id: groupId,
    name: name.trim(),
    show_id: showId,
    source: "manual",
  });

  if (result.error) {
    throw new Error(
      `Field position could not be created: ${result.error.message}`,
    );
  }

  notifyPositionStoreChanged(showId);
}

export async function syncScriptPositions(
  showId: string,
  positionNames: string[],
): Promise<PositionImportSummary> {
  const supabase = createSupabaseBrowserClient();
  const uniquePositions = new Map<string, string>();

  positionNames.forEach((name) => {
    const trimmedName = name.trim();

    if (trimmedName) {
      uniquePositions.set(normalizeName(trimmedName), trimmedName);
    }
  });

  const existingResult = await supabase
    .from("positions")
    .select("id, name, source")
    .eq("show_id", showId);

  if (existingResult.error) {
    throw new Error(
      `Existing positions could not be loaded for script import: ${existingResult.error.message}`,
    );
  }

  const existingPositions = existingResult.data ?? [];
  const existingNames = new Set(
    existingPositions.map((position) => normalizeName(position.name)),
  );
  const inserts = Array.from(uniquePositions.entries())
    .filter(([name]) => !existingNames.has(name))
    .map(([, name]) => ({
      group_id: null,
      name,
      show_id: showId,
      source: "script_imported",
    }));
  const staleIds = existingPositions
    .filter(
      (position) =>
        position.source === "script_imported" &&
        !uniquePositions.has(normalizeName(position.name)),
    )
    .map((position) => position.id);

  if (inserts.length > 0) {
    const insertResult = await supabase.from("positions").insert(inserts);

    if (insertResult.error) {
      throw new Error(
        `Script positions could not be imported: ${insertResult.error.message}`,
      );
    }
  }

  if (staleIds.length > 0) {
    const deleteResult = await supabase
      .from("positions")
      .delete()
      .eq("show_id", showId)
      .in("id", staleIds);

    if (deleteResult.error) {
      notifyPositionStoreChanged(showId);
      throw new Error(
        `New script positions were imported, but stale positions could not be removed: ${deleteResult.error.message}`,
      );
    }
  }

  if (inserts.length > 0 || staleIds.length > 0) {
    notifyPositionStoreChanged(showId);
  }

  return {
    duplicatesSkipped: uniquePositions.size - inserts.length,
    positionsFound: uniquePositions.size,
    positionsImported: inserts.length,
    stalePositionsRemoved: staleIds.length,
  };
}

export async function moveFieldPosition(
  showId: string,
  positionId: string,
  groupId: string | null,
) {
  return moveFieldPositions(showId, [positionId], groupId);
}

export async function moveFieldPositions(
  showId: string,
  positionIds: string[],
  groupId: string | null,
) {
  if (positionIds.length === 0) {
    return;
  }

  const supabase = createSupabaseBrowserClient();
  const result = await supabase
    .from("positions")
    .update({
      group_id: groupId,
      updated_at: new Date().toISOString(),
    })
    .eq("show_id", showId)
    .in("id", positionIds);

  if (result.error) {
    throw new Error(
      `Position assignment could not be updated: ${result.error.message}`,
    );
  }

  notifyPositionStoreChanged(showId);
}

export async function renameFieldPosition(
  showId: string,
  positionId: string,
  name: string,
) {
  const supabase = createSupabaseBrowserClient();
  const currentResult = await supabase
    .from("positions")
    .select("name")
    .eq("id", positionId)
    .eq("show_id", showId)
    .single();

  if (currentResult.error) {
    throw new Error(
      `Position could not be loaded for renaming: ${currentResult.error.message}`,
    );
  }

  const trimmedName = name.trim();
  const result = await supabase
    .from("positions")
    .update({
      name: trimmedName,
      updated_at: new Date().toISOString(),
    })
    .eq("id", positionId)
    .eq("show_id", showId);

  if (result.error) {
    throw new Error(
      `Position could not be renamed: ${result.error.message}`,
    );
  }

  try {
    await renameFieldMapMarker(
      showId,
      "position",
      currentResult.data.name,
      trimmedName,
    );
  } finally {
    notifyPositionStoreChanged(showId);
  }
}

export async function deleteFieldPosition(
  showId: string,
  positionId: string,
) {
  const supabase = createSupabaseBrowserClient();
  const result = await supabase
    .from("positions")
    .delete()
    .eq("id", positionId)
    .eq("show_id", showId);

  if (result.error) {
    throw new Error(
      `Position could not be deleted: ${result.error.message}`,
    );
  }

  notifyPositionStoreChanged(showId);
}

// TODO(field zones): support team and technician assignment by field zone.
