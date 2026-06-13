"use client";

import {
  type ChangeEvent,
  type DragEvent,
  type MouseEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  clearFieldMapImage,
  saveFieldMapImage,
  useFieldMap,
  type FieldMapMarker,
} from "@/components/field-map-store";
import type {
  FieldPosition,
  PositionGroup,
} from "@/components/position-store";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png"];

type MarkerTarget = {
  id: string;
  label: string;
  type: FieldMapMarker["entityType"];
};

type MapPoint = {
  x: number;
  y: number;
};

type DraggingMarkers = {
  anchor: MapPoint;
  keys: string[];
  pointerId: number;
  points: Record<string, MapPoint>;
  startPoints: Record<string, MapPoint>;
};

type SelectionBox = {
  current: MapPoint;
  pointerId: number;
  start: MapPoint;
};

function markerTargetKey(
  type: FieldMapMarker["entityType"],
  name: string,
) {
  return `${type}:${name.trim().toLocaleLowerCase()}`;
}

export function PositionsMap({
  groups,
  isDirector,
  positions,
  showId,
}: {
  groups: PositionGroup[];
  isDirector: boolean;
  positions: FieldPosition[];
  showId: string;
}) {
  const fieldMap = useFieldMap(showId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const removeTargetRef = useRef<HTMLDivElement>(null);
  const dragDepthRef = useRef(0);
  const markerMovedRef = useRef(false);
  const selectionMovedRef = useRef(false);
  const [selectedTargetKey, setSelectedTargetKey] = useState("");
  const [placementPreview, setPlacementPreview] = useState<MapPoint | null>(
    null,
  );
  const [draggingMarkers, setDraggingMarkers] =
    useState<DraggingMarkers | null>(null);
  const [selectedMarkerKeys, setSelectedMarkerKeys] = useState<string[]>([]);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [isDraggingOverRemove, setIsDraggingOverRemove] = useState(false);
  const [isFileDragging, setIsFileDragging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    type: "error" | "success";
  } | null>(null);

  const markerTargets: MarkerTarget[] = [
    ...groups.map((group) => ({
      id: group.id,
      label: group.name,
      type: "group" as const,
    })),
    ...positions.map((position) => ({
      id: position.id,
      label: position.name,
      type: "position" as const,
    })),
  ];
  const markerTargetLookup = new Map(
    markerTargets.map((target) => [
      markerTargetKey(target.type, target.label),
      target,
    ]),
  );
  const visibleMarkers = fieldMap.markers.filter((marker) =>
    markerTargetLookup.has(
      markerTargetKey(marker.entityType, marker.markerName),
    ),
  );
  const visibleMarkerLookup = new Map(
    visibleMarkers.map((marker) => [
      markerTargetKey(marker.entityType, marker.markerName),
      marker,
    ]),
  );
  const placedMarkerKeys = new Set(visibleMarkerLookup.keys());
  const sortedGroups = groups
    .filter(
      (group) =>
        !placedMarkerKeys.has(markerTargetKey("group", group.name)),
    )
    .sort((left, right) =>
      left.name.localeCompare(right.name, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );
  const sortedPositions = positions
    .filter(
      (position) =>
        !placedMarkerKeys.has(
          markerTargetKey("position", position.name),
        ),
    )
    .sort((left, right) =>
      left.name.localeCompare(right.name, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );
  const selectedMarkerKeySet = new Set(
    selectedMarkerKeys.filter((key) => placedMarkerKeys.has(key)),
  );
  const selectedTarget = markerTargetLookup.get(selectedTargetKey);
  const displayedFeedback = fieldMap.error
    ? { message: fieldMap.error, type: "error" as const }
    : feedback;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedTargetKey("");
        setPlacementPreview(null);
        setSelectedMarkerKeys([]);
        setSelectionBox(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setFeedback(null);
    }, 4000);

    return () => window.clearTimeout(timeoutId);
  }, [feedback]);

  const pointFromClientCoordinates = (
    clientX: number,
    clientY: number,
  ): MapPoint | null => {
    const map = mapRef.current;

    if (!map) {
      return null;
    }

    const bounds = map.getBoundingClientRect();

    return {
      x: Math.min(
        100,
        Math.max(0, ((clientX - bounds.left) / bounds.width) * 100),
      ),
      y: Math.min(
        100,
        Math.max(0, ((clientY - bounds.top) / bounds.height) * 100),
      ),
    };
  };

  const loadImageFile = (file: File) => {
    if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
      setFeedback({
        type: "error",
        message: "Upload a JPG or PNG field map image.",
      });
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setFeedback({
        type: "error",
        message: "Field map images must be 4 MB or smaller.",
      });
      return;
    }

    const imageUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      setFeedback({
        type: "error",
        message: "The selected file is not a valid field map image.",
      });
    };
    image.onload = () => {
      URL.revokeObjectURL(imageUrl);
      setIsSaving(true);
      setFeedback(null);

      void saveFieldMapImage(showId, file)
        .then(({ warning }) => {
          setFeedback({
            type: warning ? "error" : "success",
            message:
              warning ??
              "Field map image uploaded and shared for this show.",
          });
        })
        .catch((error) => {
          setFeedback({
            type: "error",
            message:
              error instanceof Error
                ? error.message
                : "The field map image could not be uploaded.",
          });
        })
        .finally(() => setIsSaving(false));
    };
    image.src = imageUrl;
  };

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (file) {
      loadImageFile(file);
    }
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!isDirector) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current += 1;
    setIsFileDragging(true);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!isDirector) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!isDirector) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);

    if (dragDepthRef.current === 0) {
      setIsFileDragging(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!isDirector) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current = 0;
    setIsFileDragging(false);

    const file = event.dataTransfer.files[0];

    if (!file) {
      setFeedback({
        type: "error",
        message: "Drop a JPG or PNG field map image.",
      });
      return;
    }

    loadImageFile(file);
  };

  const handleMapClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!isDirector || !selectedTarget || draggingMarkers || isSaving) {
      return;
    }

    const point = pointFromClientCoordinates(event.clientX, event.clientY);

    if (!point) {
      return;
    }

    const marker = {
      entityType: selectedTarget.type,
      markerName: selectedTarget.label,
      ...point,
    };

    setIsSaving(true);
    setSelectedTargetKey("");
    setPlacementPreview(null);
    void fieldMap.placeMarkersOptimistically([marker])
      .then(() => {
        setFeedback({
          type: "success",
          message: `${selectedTarget.label} placed on the field map.`,
        });
      })
      .catch((error) => {
        setFeedback({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : `${selectedTarget.label} could not be placed.`,
        });
      })
      .finally(() => setIsSaving(false));
  };

  const handleMapPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (
      !isDirector ||
      selectedTarget ||
      draggingMarkers ||
      event.button !== 0
    ) {
      return;
    }

    const point = pointFromClientCoordinates(event.clientX, event.clientY);

    if (!point) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    selectionMovedRef.current = false;
    setSelectedMarkerKeys([]);
    setSelectionBox({
      current: point,
      pointerId: event.pointerId,
      start: point,
    });
  };

  const handleMapPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!isDirector) {
      return;
    }

    const point = pointFromClientCoordinates(event.clientX, event.clientY);

    if (!point) {
      return;
    }

    if (selectionBox?.pointerId === event.pointerId) {
      if (
        Math.abs(point.x - selectionBox.start.x) > 0.5 ||
        Math.abs(point.y - selectionBox.start.y) > 0.5
      ) {
        selectionMovedRef.current = true;
      }

      setSelectionBox((current) =>
        current ? { ...current, current: point } : current,
      );
      return;
    }

    if (selectedTarget && !draggingMarkers) {
      setPlacementPreview(point);
    }
  };

  const finishBoxSelection = (event: PointerEvent<HTMLDivElement>) => {
    if (selectionBox?.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    const point =
      pointFromClientCoordinates(event.clientX, event.clientY) ??
      selectionBox.current;
    const left = Math.min(selectionBox.start.x, point.x);
    const right = Math.max(selectionBox.start.x, point.x);
    const top = Math.min(selectionBox.start.y, point.y);
    const bottom = Math.max(selectionBox.start.y, point.y);

    setSelectedMarkerKeys(
      selectionMovedRef.current
        ? visibleMarkers
            .filter(
              (marker) =>
                marker.x >= left &&
                marker.x <= right &&
                marker.y >= top &&
                marker.y <= bottom,
            )
            .map(
              (marker) =>
                markerTargetKey(marker.entityType, marker.markerName),
            )
        : [],
    );
    setSelectionBox(null);
  };

  const handleMarkerPointerDown = (
    event: PointerEvent<HTMLButtonElement>,
    marker: FieldMapMarker,
  ) => {
    if (!isDirector) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    markerMovedRef.current = false;
    setIsDraggingOverRemove(false);
    setSelectedTargetKey("");
    setPlacementPreview(null);
    const markerKey = markerTargetKey(
      marker.entityType,
      marker.markerName,
    );
    const dragKeys = selectedMarkerKeySet.has(markerKey)
      ? Array.from(selectedMarkerKeySet)
      : [markerKey];
    const startPoints = Object.fromEntries(
      dragKeys.flatMap((key) => {
        const placedMarker = visibleMarkerLookup.get(key);
        return placedMarker
          ? [[key, { x: placedMarker.x, y: placedMarker.y }]]
          : [];
      }),
    );
    const anchor = pointFromClientCoordinates(
      event.clientX,
      event.clientY,
    ) ?? { x: marker.x, y: marker.y };

    setSelectedMarkerKeys(dragKeys);
    setDraggingMarkers({
      anchor,
      keys: dragKeys,
      pointerId: event.pointerId,
      points: startPoints,
      startPoints,
    });
  };

  const handleMarkerPointerMove = (
    event: PointerEvent<HTMLButtonElement>,
  ) => {
    if (
      !draggingMarkers ||
      draggingMarkers.pointerId !== event.pointerId
    ) {
      return;
    }

    const point = pointFromClientCoordinates(event.clientX, event.clientY);

    if (point) {
      markerMovedRef.current = true;
      const removeBounds = removeTargetRef.current?.getBoundingClientRect();
      setIsDraggingOverRemove(
        Boolean(
          removeBounds &&
            event.clientX >= removeBounds.left &&
            event.clientX <= removeBounds.right &&
            event.clientY >= removeBounds.top &&
            event.clientY <= removeBounds.bottom,
        ),
      );
      const startPoints = Object.values(draggingMarkers.startPoints);
      const requestedDeltaX = point.x - draggingMarkers.anchor.x;
      const requestedDeltaY = point.y - draggingMarkers.anchor.y;
      const deltaX = Math.min(
        100 - Math.max(...startPoints.map((start) => start.x)),
        Math.max(
          -Math.min(...startPoints.map((start) => start.x)),
          requestedDeltaX,
        ),
      );
      const deltaY = Math.min(
        100 - Math.max(...startPoints.map((start) => start.y)),
        Math.max(
          -Math.min(...startPoints.map((start) => start.y)),
          requestedDeltaY,
        ),
      );

      setDraggingMarkers((current) =>
        current
          ? {
              ...current,
              points: Object.fromEntries(
                Object.entries(current.startPoints).map(
                  ([key, start]) => [
                    key,
                    {
                      x: start.x + deltaX,
                      y: start.y + deltaY,
                    },
                  ],
                ),
              ),
            }
          : current,
      );
    }
  };

  const finishMarkersDrag = (
    event: PointerEvent<HTMLButtonElement>,
    allowRemove = true,
  ) => {
    if (
      !draggingMarkers ||
      draggingMarkers.pointerId !== event.pointerId
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const removeBounds = removeTargetRef.current?.getBoundingClientRect();
    const shouldRemove = Boolean(
      allowRemove &&
        removeBounds &&
        event.clientX >= removeBounds.left &&
        event.clientX <= removeBounds.right &&
        event.clientY >= removeBounds.top &&
        event.clientY <= removeBounds.bottom,
    );

    if (!markerMovedRef.current && !shouldRemove) {
      setDraggingMarkers(null);
      setIsDraggingOverRemove(false);
      return;
    }

    const affectedMarkers = draggingMarkers.keys.flatMap((key) => {
      const marker = visibleMarkerLookup.get(key);
      const point = draggingMarkers.points[key];

      return marker && point ? [{ ...marker, ...point }] : [];
    });
    const affectedCount = affectedMarkers.length;

    const operation = shouldRemove
      ? fieldMap.removeMarkersOptimistically(affectedMarkers)
      : fieldMap.placeMarkersOptimistically(affectedMarkers);

    setIsSaving(true);
    setDraggingMarkers(null);
    setIsDraggingOverRemove(false);
    void operation
      .then(() => {
        setFeedback({
          type: "success",
          message: shouldRemove
            ? `${affectedCount} marker${
                affectedCount === 1 ? "" : "s"
              } removed from the field map.`
            : `${affectedCount} marker${
                affectedCount === 1 ? "" : "s"
              } position updated.`,
        });

        if (shouldRemove) {
          setSelectedMarkerKeys([]);
        }
      })
      .catch((error) => {
        setFeedback({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "The marker change could not be saved.",
        });
      })
      .finally(() => setIsSaving(false));
  };

  const cancelPlacement = () => {
    setSelectedTargetKey("");
    setPlacementPreview(null);
  };

  return (
    <section className="rounded-lg border border-white/10 bg-[#0b1020]/90 p-5 shadow-xl shadow-black/20">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#a78bfa]">
            Map View
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            Field Position Map
          </h2>
          <p className="mt-1 text-sm text-[#94a3b8]">
            {isDirector
              ? "Upload or drop a field image, then place positions and groups."
              : "Read-only field reference for the active show."}
          </p>
        </div>
        <span className="w-fit rounded border border-white/10 px-2 py-1 text-xs font-semibold text-[#94a3b8]">
          {isDirector ? "Editable" : "Read Only"}
        </span>
      </div>

      {isDirector ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-y border-white/10 py-3">
          <input
            accept="image/jpeg,image/png"
            className="sr-only"
            onChange={handleImageUpload}
            ref={fileInputRef}
            type="file"
          />
          <button
            className="rounded-md bg-[#6d28d9] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#7c3aed]"
            disabled={isSaving}
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            {isSaving
              ? "Saving..."
              : fieldMap.imageUrl
                ? "Replace Field Map"
                : "Upload Field Map"}
          </button>
          {fieldMap.imageUrl ? (
            <>
              <select
                className="h-10 min-w-52 rounded-md border border-white/15 bg-[#070b18] px-3 text-sm font-semibold text-white outline-none focus:border-[#a78bfa]"
                onChange={(event) => {
                  setSelectedTargetKey(event.target.value);
                  setPlacementPreview(null);
                  setFeedback(null);
                }}
                value={selectedTargetKey}
              >
                <option value="">Select Position To Place</option>
                {sortedGroups.length > 0 ? (
                  <optgroup label="Position Groups">
                    {sortedGroups.map((group) => (
                      <option
                        key={group.id}
                        value={markerTargetKey("group", group.name)}
                      >
                        {group.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {sortedPositions.length > 0 ? (
                  <optgroup label="Positions">
                    {sortedPositions.map((position) => (
                      <option
                        key={position.id}
                        value={markerTargetKey(
                          "position",
                          position.name,
                        )}
                      >
                        {position.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
              {selectedTarget ? (
                <button
                  className="rounded-md border border-[#8b5cf6]/45 px-4 py-2 text-sm font-semibold text-[#ddd6fe] transition hover:border-[#a78bfa]"
                  onClick={cancelPlacement}
                  type="button"
                >
                  Cancel Placement
                </button>
              ) : null}
              <button
                className="rounded-md border border-[#ef4444]/35 px-4 py-2 text-sm font-semibold text-[#fecaca] transition hover:border-[#ef4444]/65"
                disabled={isSaving}
                onClick={() => {
                  if (
                    window.confirm(
                      "Remove the uploaded field map image? Marker placements, position groups, and positions will be kept.",
                    )
                  ) {
                    setIsSaving(true);
                    setFeedback(null);
                    void clearFieldMapImage(showId)
                      .then(({ warning }) => {
                        cancelPlacement();
                        setSelectedMarkerKeys([]);
                        setFeedback({
                          type: warning ? "error" : "success",
                          message:
                            warning ??
                            "Field map image cleared. Marker placements and position data were kept.",
                        });
                      })
                      .catch((error) => {
                        setFeedback({
                          type: "error",
                          message:
                            error instanceof Error
                              ? error.message
                              : "The field map image could not be cleared.",
                        });
                      })
                      .finally(() => setIsSaving(false));
                  }
                }}
                type="button"
              >
                Clear Map
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {displayedFeedback ? (
        <div
          aria-live={
            displayedFeedback.type === "error" ? "assertive" : "polite"
          }
          className={`pointer-events-none fixed bottom-5 right-5 z-50 max-w-sm rounded-md border px-4 py-3 text-sm font-semibold shadow-2xl shadow-black/40 ${
            displayedFeedback.type === "success"
              ? "border-[#22c55e]/35 bg-[#082515] text-[#bbf7d0]"
              : "border-[#ef4444]/40 bg-[#2a0b13] text-[#fecaca]"
          }`}
          role={
            displayedFeedback.type === "error" ? "alert" : "status"
          }
        >
          {displayedFeedback.message}
        </div>
      ) : null}

      <div
        className={`relative mt-4 rounded-lg border-2 border-dashed transition ${
          isFileDragging
            ? "border-[#a78bfa] bg-[#4c00a4]/20 shadow-[0_0_24px_rgba(139,92,246,0.2)]"
            : "border-transparent"
        }`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {isFileDragging ? (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-lg bg-[#070b18]/80">
            <p className="rounded-md border border-[#a78bfa]/60 bg-[#160d2d] px-5 py-3 font-semibold text-white">
              Drop JPG or PNG field map
            </p>
          </div>
        ) : null}

        {fieldMap.imageUrl ? (
          <>
            <div
              aria-label="Uploaded field map"
              className={`relative w-full touch-none overflow-hidden rounded-lg border border-[#8b5cf6]/25 bg-[#070b18] bg-contain bg-center bg-no-repeat ${
                isDirector && selectedTarget
                  ? "cursor-none ring-2 ring-[#8b5cf6]/60"
                  : isDirector
                    ? "cursor-crosshair"
                    : "cursor-default"
              }`}
              onClick={handleMapClick}
              onPointerLeave={() => {
                if (!draggingMarkers && !selectionBox) {
                  setPlacementPreview(null);
                }
              }}
              onPointerCancel={finishBoxSelection}
              onPointerDown={handleMapPointerDown}
              onPointerMove={handleMapPointerMove}
              onPointerUp={finishBoxSelection}
              ref={mapRef}
              role="img"
              style={{
                aspectRatio: fieldMap.imageAspectRatio,
                backgroundImage: `url("${fieldMap.imageUrl}")`,
              }}
            >
              {visibleMarkers.map((marker) => {
                const key = markerTargetKey(
                  marker.entityType,
                  marker.markerName,
                );
                const target = markerTargetLookup.get(key);
                const isDragging = Boolean(draggingMarkers?.points[key]);
                const isSelected = selectedMarkerKeySet.has(key);
                const renderedPoint =
                  draggingMarkers?.points[key] ?? marker;

                if (!target) {
                  return null;
                }

                return (
                  <button
                    aria-label={`${target.label} marker`}
                    className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-2 px-2 py-1 text-xs font-bold shadow-lg transition-shadow ${
                      marker.entityType === "group"
                        ? "border-[#c4b5fd] bg-[#4c00a4] text-white"
                        : "border-[#fecaca] bg-[#991b1b] text-white"
                    } ${
                      isDirector ? "cursor-grab active:cursor-grabbing" : "cursor-default"
                    } ${
                      isDragging
                        ? "z-20 scale-105 opacity-85 shadow-[0_0_18px_rgba(167,139,250,0.65)]"
                        : isSelected
                          ? "z-20 ring-2 ring-[#f8fafc] ring-offset-2 ring-offset-[#4c00a4]/60 shadow-[0_0_16px_rgba(248,250,252,0.4)]"
                        : ""
                    }`}
                    key={key}
                    onClick={(event) => {
                      event.stopPropagation();

                      if (markerMovedRef.current) {
                        markerMovedRef.current = false;
                        return;
                      }

                      if (isDirector) {
                        setSelectedMarkerKeys([key]);
                        setSelectedTargetKey("");
                        setPlacementPreview(null);
                      }
                    }}
                    onPointerCancel={(event) =>
                      finishMarkersDrag(event, false)
                    }
                    onPointerDown={(event) =>
                      handleMarkerPointerDown(event, marker)
                    }
                    onPointerMove={handleMarkerPointerMove}
                    onPointerUp={(event) =>
                      finishMarkersDrag(event)
                    }
                    style={{
                      left: `${renderedPoint.x}%`,
                      top: `${renderedPoint.y}%`,
                    }}
                    title={
                      isDirector
                        ? `${target.label}: drag to move`
                        : target.label
                    }
                    type="button"
                  >
                    {target.label}
                  </button>
                );
              })}

              {isDirector && draggingMarkers ? (
                <div
                  aria-hidden="true"
                  className={`pointer-events-none absolute bottom-3 right-3 z-30 flex min-h-14 min-w-36 flex-col items-center justify-center rounded-md border-2 px-4 py-2 text-center transition ${
                    isDraggingOverRemove
                      ? "scale-105 border-[#fca5a5] bg-[#7f1d1d] text-white shadow-[0_0_20px_rgba(239,68,68,0.55)]"
                      : "border-[#ef4444]/55 bg-[#2a0b13]/95 text-[#fecaca]"
                  }`}
                  ref={removeTargetRef}
                >
                  <span className="text-xs font-bold uppercase">
                    Remove Position
                  </span>
                  {isDraggingOverRemove ? (
                    <span className="mt-1 text-[11px] font-semibold normal-case">
                      Release to delete{" "}
                      {draggingMarkers.keys.length > 1
                        ? `all ${draggingMarkers.keys.length} selected`
                        : "marker"}
                    </span>
                  ) : null}
                </div>
              ) : null}

              {isDirector && selectionBox ? (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute z-20 border border-[#c4b5fd] bg-[#8b5cf6]/20 shadow-[0_0_14px_rgba(139,92,246,0.25)]"
                  style={{
                    height: `${Math.abs(
                      selectionBox.current.y - selectionBox.start.y,
                    )}%`,
                    left: `${Math.min(
                      selectionBox.start.x,
                      selectionBox.current.x,
                    )}%`,
                    top: `${Math.min(
                      selectionBox.start.y,
                      selectionBox.current.y,
                    )}%`,
                    width: `${Math.abs(
                      selectionBox.current.x - selectionBox.start.x,
                    )}%`,
                  }}
                />
              ) : null}

              {isDirector && selectedTarget && placementPreview ? (
                <div
                  aria-hidden="true"
                  className={`pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed px-2 py-1 text-xs font-bold text-white opacity-55 shadow-lg ${
                    selectedTarget.type === "group"
                      ? "border-[#c4b5fd] bg-[#4c00a4]"
                      : "border-[#fecaca] bg-[#991b1b]"
                  }`}
                  style={{
                    left: `${placementPreview.x}%`,
                    top: `${placementPreview.y}%`,
                  }}
                >
                  {selectedTarget.label}
                </div>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 px-1 text-xs text-[#94a3b8]">
              <span>{fieldMap.imageName}</span>
              <span>{visibleMarkers.length} markers placed</span>
              {isDirector && selectedMarkerKeySet.size > 0 ? (
                <>
                  <span className="font-semibold text-[#ddd6fe]">
                    {selectedMarkerKeySet.size} marker
                    {selectedMarkerKeySet.size === 1 ? "" : "s"} selected
                  </span>
                  <button
                    className="font-semibold text-[#fca5a5] hover:text-[#fecaca]"
                    disabled={isSaving}
                    onClick={() => {
                      const keys = Array.from(selectedMarkerKeySet);
                      const markers = keys.flatMap((key) => {
                        const marker = visibleMarkerLookup.get(key);
                        return marker ? [marker] : [];
                      });

                      setIsSaving(true);
                      void fieldMap
                        .removeMarkersOptimistically(markers)
                        .then(() => {
                          setSelectedMarkerKeys([]);
                          setFeedback({
                            type: "success",
                            message: `${markers.length} marker${
                              markers.length === 1 ? "" : "s"
                            } removed from the field map.`,
                          });
                        })
                        .catch((error) => {
                          setFeedback({
                            type: "error",
                            message:
                              error instanceof Error
                                ? error.message
                                : "The selected markers could not be removed.",
                          });
                        })
                        .finally(() => setIsSaving(false));
                    }}
                    type="button"
                  >
                    Remove Selected
                  </button>
                </>
              ) : null}
              {isDirector && selectedTarget ? (
                <>
                  <span className="font-semibold text-[#c4b5fd]">
                    Placement mode: {selectedTarget.label}
                  </span>
                  <span>Click map to place. Escape cancels.</span>
                </>
              ) : null}
            </div>
          </>
        ) : (
          <button
            className="flex min-h-72 w-full items-center justify-center rounded-lg border border-dashed border-white/15 bg-[#070b18] px-6 text-center transition hover:border-[#8b5cf6]/45"
            disabled={!isDirector}
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <span>
              <span className="block font-semibold text-[#dbe4ef]">
                {isDirector
                  ? fieldMap.isLoading
                    ? "Loading shared field map..."
                    : "Drop a field map image here or click to upload"
                  : "No field map has been uploaded for this show"}
              </span>
              <span className="mt-2 block text-sm text-[#94a3b8]">
                {isDirector
                  ? "JPG or PNG up to 4 MB."
                  : "The Director can prepare this field reference from Director View."}
              </span>
            </span>
          </button>
        )}
      </div>

      {/* TODO(google maps): add Google Maps as an optional future provider. */}
      {/* TODO(map storage): move uploaded field maps and coordinates to durable storage. */}
    </section>
  );
}
