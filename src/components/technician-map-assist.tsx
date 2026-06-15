"use client";

import { useEffect } from "react";
import { useFieldMap } from "@/components/field-map-store";
import { useShowPositions } from "@/components/position-store";

export function TechnicianMapAssist({
  onDataState,
  onClose,
  positionName,
  showId,
}: {
  onDataState?: (
    status: "loading" | "loaded" | "error",
    error: string | null,
  ) => void;
  onClose: () => void;
  positionName: string;
  showId: string;
}) {
  const fieldMap = useFieldMap(showId);
  const showPositions = useShowPositions(showId);
  const normalizedPositionName = positionName.trim().toLocaleLowerCase();
  const position = showPositions.positions.find(
    (candidate) =>
      candidate.name.trim().toLocaleLowerCase() === normalizedPositionName,
  );
  const directMarker = position
    ? fieldMap.markers.find(
        (marker) =>
          marker.entityType === "position" &&
          marker.markerName.trim().toLocaleLowerCase() ===
            position.name.trim().toLocaleLowerCase(),
      )
    : null;
  const group = position?.groupId
    ? showPositions.groups.find(
        (candidate) => candidate.id === position.groupId,
      )
    : showPositions.groups.find(
        (candidate) =>
          candidate.name.trim().toLocaleLowerCase() ===
          normalizedPositionName,
      );
  const groupMarker =
    !directMarker && group
      ? fieldMap.markers.find(
          (marker) =>
            marker.entityType === "group" &&
            marker.markerName.trim().toLocaleLowerCase() ===
              group.name.trim().toLocaleLowerCase(),
        )
      : null;
  const targetMarker = directMarker ?? groupMarker ?? null;
  const markerNames = new Set([
    ...showPositions.groups.map(
      (candidate) =>
        `group:${candidate.name.trim().toLocaleLowerCase()}`,
    ),
    ...showPositions.positions.map(
      (candidate) =>
        `position:${candidate.name.trim().toLocaleLowerCase()}`,
    ),
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    const previousDocumentOverflow =
      document.documentElement.style.overflow;
    const previousOverflow = document.body.style.overflow;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.documentElement.style.overflow = previousDocumentOverflow;
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    if (!onDataState) {
      return;
    }

    if (fieldMap.error) {
      onDataState("error", fieldMap.error);
    } else if (fieldMap.isLoading) {
      onDataState("loading", null);
    } else {
      onDataState("loaded", null);
    }
  }, [fieldMap.error, fieldMap.isLoading, onDataState]);

  return (
    <div
      aria-label={`Map assist for ${positionName}`}
      aria-modal="true"
      className="technician-map-assist-overlay fixed inset-0 z-[100] flex items-center justify-center bg-[#020617] p-0 backdrop-blur-sm md:bg-[#020617]/85 md:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
    >
      <section className="technician-map-assist-surface relative flex h-dvh w-full flex-col overflow-hidden bg-[#0b1020] shadow-2xl shadow-black/60 md:h-auto md:max-h-[92vh] md:max-w-5xl md:rounded-lg md:border md:border-[#8b5cf6]/35">
        <header className="technician-map-assist-header flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-3 py-2 md:px-5 md:py-4">
          <div className="technician-map-assist-title">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#a78bfa] md:text-xs">
              Technician Map Assist
            </p>
            <h2 className="mt-0.5 text-sm font-semibold text-white md:mt-1 md:text-lg">
              {positionName}
            </h2>
            {targetMarker ? (
              <p className="mt-0.5 hidden text-xs text-[#94a3b8] md:block">
                Highlighting{" "}
                {directMarker
                  ? "the position marker"
                  : `group ${group?.name ?? ""}`}
                .
              </p>
            ) : null}
          </div>
          <button
            aria-label="Close map assist"
            className="technician-map-assist-close flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-lg border border-white/20 bg-[#111827] text-2xl font-semibold text-white transition active:bg-[#1f2937] md:size-10 md:rounded-md md:bg-transparent md:text-xl md:text-[#cbd5e1] md:hover:border-[#8b5cf6]/55 md:hover:text-white"
            onClick={onClose}
            type="button"
          >
            X
          </button>
        </header>

        <p className="technician-map-assist-guidance shrink-0 border-b border-[#8b5cf6]/25 bg-[#17102c] px-3 py-1.5 text-center text-[11px] font-semibold text-[#d8c8ff] md:hidden">
          Rotate phone sideways for best map view.
        </p>

        <div className="technician-map-assist-body flex min-h-0 flex-1 items-center justify-center overflow-hidden p-1 md:block md:overflow-auto md:p-5">
          {fieldMap.error ? (
            <div className="flex min-h-72 w-full items-center justify-center rounded-lg border border-[#ef4444]/35 bg-[#2a0b13] px-6 text-center">
              <p className="font-semibold text-[#fecaca]">
                {fieldMap.error}
              </p>
            </div>
          ) : !fieldMap.imageUrl ? (
            <div className="flex min-h-72 w-full items-center justify-center rounded-lg border border-dashed border-white/15 bg-[#070b18] px-6 text-center">
              <p className="font-semibold text-[#cbd5e1]">
                {fieldMap.isLoading
                  ? "Loading shared field map..."
                  : "No field map has been configured for this show."}
              </p>
            </div>
          ) : (
            <div className="technician-map-assist-map-frame flex h-full min-h-0 w-full flex-col items-center justify-center md:block">
              <div
                aria-label="Technician field map"
                className="technician-map-assist-canvas relative max-h-full w-full overflow-hidden rounded-none border-0 bg-[#070b18] bg-contain bg-center bg-no-repeat md:max-h-none md:rounded-lg md:border md:border-white/10"
                role="img"
                style={{
                  aspectRatio: fieldMap.imageAspectRatio,
                  backgroundImage: `url("${fieldMap.imageUrl}")`,
                  backgroundSize: "contain",
                }}
              >
                {fieldMap.markers.map((marker) => {
                  const label = marker.markerName;
                  const markerKey = `${marker.entityType}:${marker.markerName
                    .trim()
                    .toLocaleLowerCase()}`;

                  if (!markerNames.has(markerKey)) {
                    return null;
                  }

                  return (
                    <span
                      className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 px-2 py-1 text-[10px] font-bold text-white shadow-lg sm:text-xs ${
                        marker.entityType === "group"
                          ? "border-[#c4b5fd] bg-[#4c00a4]"
                          : "border-[#fecaca] bg-[#991b1b]"
                      }`}
                      key={markerKey}
                      style={{
                        left: `${marker.x}%`,
                        top: `${marker.y}%`,
                      }}
                    >
                      {label}
                    </span>
                  );
                })}

                {targetMarker ? (
                  <span
                    aria-label={`Highlighted location for ${positionName}`}
                    className="pointer-events-none absolute z-20 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-[#fbbf24] bg-[#f59e0b]/25 shadow-[0_0_26px_rgba(251,191,36,0.85)] sm:size-16"
                    style={{
                      left: `${targetMarker.x}%`,
                      top: `${targetMarker.y}%`,
                    }}
                  >
                    <span className="absolute inset-0 rounded-full border-4 border-[#fbbf24]/80 motion-safe:animate-ping motion-reduce:animate-none" />
                    <span className="size-3 rounded-full bg-[#fde68a] shadow-[0_0_12px_rgba(253,230,138,1)]" />
                  </span>
                ) : null}
              </div>

              {!targetMarker ? (
                <p className="mt-3 rounded-md border border-white/10 bg-[#070b18] px-4 py-3 text-center text-sm font-semibold text-[#cbd5e1]">
                  No map marker found for this issue position.
                </p>
              ) : null}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
