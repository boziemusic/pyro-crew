"use client";

import { useEffect } from "react";
import { useFieldMap } from "@/components/field-map-store";
import { useShowPositions } from "@/components/position-store";

export function TechnicianMapAssist({
  onClose,
  positionName,
  showId,
}: {
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
          marker.entityId === position.id,
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
            marker.entityId === group.id,
        )
      : null;
  const targetMarker = directMarker ?? groupMarker ?? null;
  const markerLabels = new Map<string, string>([
    ...showPositions.groups.map(
      (candidate): [string, string] => [
        `group:${candidate.id}`,
        candidate.name,
      ],
    ),
    ...showPositions.positions.map(
      (candidate): [string, string] => [
        `position:${candidate.id}`,
        candidate.name,
      ],
    ),
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      aria-label={`Map assist for ${positionName}`}
      aria-modal="true"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[#020617]/85 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
    >
      <section className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-[#8b5cf6]/35 bg-[#0b1020] shadow-2xl shadow-black/60">
        <header className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#a78bfa]">
              Technician Map Assist
            </p>
            <h2 className="mt-1 text-lg font-semibold text-white">
              {positionName}
            </h2>
            {targetMarker ? (
              <p className="mt-1 text-xs text-[#94a3b8]">
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
            className="flex size-10 shrink-0 items-center justify-center rounded-md border border-white/15 text-xl font-semibold text-[#cbd5e1] transition hover:border-[#8b5cf6]/55 hover:text-white"
            onClick={onClose}
            type="button"
          >
            X
          </button>
        </header>

        <div className="min-h-0 overflow-auto p-3 sm:p-5">
          {!fieldMap.imageDataUrl ? (
            <div className="flex min-h-72 items-center justify-center rounded-lg border border-dashed border-white/15 bg-[#070b18] px-6 text-center">
              <p className="font-semibold text-[#cbd5e1]">
                No field map has been configured for this show.
              </p>
            </div>
          ) : (
            <>
              <div
                aria-label="Technician field map"
                className="relative w-full overflow-hidden rounded-lg border border-white/10 bg-[#070b18] bg-contain bg-center bg-no-repeat"
                role="img"
                style={{
                  aspectRatio: fieldMap.imageAspectRatio,
                  backgroundImage: `url("${fieldMap.imageDataUrl}")`,
                }}
              >
                {fieldMap.markers.map((marker) => {
                  const markerKey = `${marker.entityType}:${marker.entityId}`;
                  const label = markerLabels.get(markerKey);

                  if (!label) {
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
            </>
          )}
        </div>
      </section>
    </div>
  );
}
