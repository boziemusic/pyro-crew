"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useFieldMap } from "@/components/field-map-store";
import { formatIssueLabel } from "@/components/issue-identifiers";
import { useShowPositions } from "@/components/position-store";
import {
  setSelectedTemporaryTechnician,
  type TemporaryTechnicianId,
} from "@/components/temporary-technician-store";

export type TechnicianMapLocation = {
  activityStartedAt: string | null;
  channelNumber: number | null;
  cueValue: string | null;
  id: TemporaryTechnicianId;
  issueType: string | null;
  label: string;
  positionName: string | null;
  resolvedCount: number;
  shortLabel: string;
  status:
    | "working"
    | "awaiting-director"
    | "assigned"
    | "last-known"
    | "ready";
};

const technicianStyles: Record<
  TemporaryTechnicianId,
  { accent: string; marker: string }
> = {
  tech_1: {
    accent: "border-[#3b82f6]/55 bg-[#0b1b35]",
    marker: "border-[#bfdbfe] bg-[#1d4ed8]",
  },
  tech_2: {
    accent: "border-[#22c55e]/55 bg-[#082515]",
    marker: "border-[#bbf7d0] bg-[#15803d]",
  },
  tech_3: {
    accent: "border-[#f59e0b]/55 bg-[#2a1c06]",
    marker: "border-[#fde68a] bg-[#b45309]",
  },
  tech_4: {
    accent: "border-[#d946ef]/55 bg-[#2a0b2f]",
    marker: "border-[#f5d0fe] bg-[#a21caf]",
  },
};

const statusLabels = {
  assigned: "Assigned",
  "awaiting-director": "Awaiting Director",
  "last-known": "Last Location",
  ready: "Ready to Deploy",
  working: "Working",
} as const;

const collisionOffsets = [
  { x: 0, y: 0 },
  { x: 2.8, y: -2.8 },
  { x: -2.8, y: -2.8 },
  { x: 2.8, y: 2.8 },
  { x: -2.8, y: 2.8 },
];

function clampPercent(value: number) {
  return Math.min(98, Math.max(2, value));
}

function formatMapElapsedTime(
  startedAt: string | null,
  now: number | null,
) {
  if (!startedAt || now === null) {
    return null;
  }

  const elapsedSeconds = Math.max(
    0,
    Math.floor((now - new Date(startedAt).getTime()) / 1000),
  );
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;

  return [minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export function DirectorTechLocationMap({
  locations,
  now,
  onClose,
  showId,
}: {
  locations: TechnicianMapLocation[];
  now: number | null;
  onClose: () => void;
  showId: string;
}) {
  const fieldMap = useFieldMap(showId);
  const showPositions = useShowPositions(showId);
  const markerNames = new Set([
    ...showPositions.groups.map(
      (group) => `group:${group.name.trim().toLocaleLowerCase()}`,
    ),
    ...showPositions.positions.map(
      (position) => `position:${position.name.trim().toLocaleLowerCase()}`,
    ),
  ]);

  const resolvedLocations = locations.map((location) => {
    if (!location.positionName) {
      return { ...location, marker: null };
    }

    const normalizedName = location.positionName
      .trim()
      .toLocaleLowerCase();
    const position = showPositions.positions.find(
      (candidate) =>
        candidate.name.trim().toLocaleLowerCase() === normalizedName,
    );
    const directMarker = fieldMap.markers.find(
      (marker) =>
        marker.entityType === "position" &&
        marker.markerName.trim().toLocaleLowerCase() ===
          (position?.name.trim().toLocaleLowerCase() ?? normalizedName),
    );
    const group = position?.groupId
      ? showPositions.groups.find(
          (candidate) => candidate.id === position.groupId,
        )
      : showPositions.groups.find(
          (candidate) =>
            candidate.name.trim().toLocaleLowerCase() === normalizedName,
        );
    const groupMarker = group
      ? fieldMap.markers.find(
          (marker) =>
            marker.entityType === "group" &&
            marker.markerName.trim().toLocaleLowerCase() ===
              group.name.trim().toLocaleLowerCase(),
        )
      : null;

    return {
      ...location,
      marker: directMarker ?? groupMarker ?? null,
    };
  });
  const plottedLocations = resolvedLocations.map((location, index, all) => {
    if (!location.marker) {
      return { ...location, displayMarker: null };
    }

    const nearbyBefore = all
      .slice(0, index)
      .filter(
        (candidate) =>
          candidate.marker &&
          Math.hypot(
            candidate.marker.x - location.marker!.x,
            candidate.marker.y - location.marker!.y,
          ) < 3,
      ).length;
    const offset =
      collisionOffsets[
        Math.min(nearbyBefore, collisionOffsets.length - 1)
      ];

    return {
      ...location,
      displayMarker: {
        x: clampPercent(location.marker.x + offset.x),
        y: clampPercent(location.marker.y + offset.y),
      },
    };
  });

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
      aria-labelledby="director-tech-map-title"
      aria-modal="true"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[#020617]/90 p-2 backdrop-blur-sm sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
    >
      <section className="flex max-h-[96vh] w-full max-w-[96rem] flex-col overflow-hidden rounded-xl border border-[#8b5cf6]/35 bg-[#0b1020] shadow-2xl shadow-black/70">
        <header className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#a78bfa]">
              Director Field View
            </p>
            <h2
              className="mt-1 text-xl font-semibold text-white"
              id="director-tech-map-title"
            >
              Technician Location Map
            </h2>
          </div>
          <button
            aria-label="Close technician location map"
            className="flex size-10 items-center justify-center rounded-md border border-white/15 text-xl font-semibold text-[#cbd5e1] hover:border-[#8b5cf6]/55 hover:text-white"
            onClick={onClose}
            type="button"
          >
            X
          </button>
        </header>

        <div className="grid min-h-0 gap-4 overflow-auto p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <div>
            {fieldMap.error ? (
              <div className="flex min-h-80 items-center justify-center rounded-lg border border-[#ef4444]/35 bg-[#2a0b13] p-6 text-center font-semibold text-[#fecaca]">
                {fieldMap.error}
              </div>
            ) : !fieldMap.imageUrl ? (
              <div className="flex min-h-80 items-center justify-center rounded-lg border border-dashed border-white/15 bg-[#070b18] p-6 text-center font-semibold text-[#cbd5e1]">
                {fieldMap.isLoading
                  ? "Loading shared field map..."
                  : "No field map has been configured for this show."}
              </div>
            ) : (
              <div
                aria-label="Field map with technician locations"
                className="relative w-full overflow-hidden rounded-lg border border-white/10 bg-[#070b18] bg-contain bg-center bg-no-repeat"
                role="img"
                style={{
                  aspectRatio: fieldMap.imageAspectRatio,
                  backgroundImage: `url("${fieldMap.imageUrl}")`,
                }}
              >
                {fieldMap.markers.map((marker) => {
                  const markerKey = `${marker.entityType}:${marker.markerName
                    .trim()
                    .toLocaleLowerCase()}`;

                  if (!markerNames.has(markerKey)) {
                    return null;
                  }

                  return (
                    <span
                      className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 px-2 py-1 text-xs font-bold text-white shadow-lg ${
                        marker.entityType === "group"
                          ? "border-[#c4b5fd]/45 bg-[#4c00a4]/65"
                          : "border-[#fecaca]/45 bg-[#991b1b]/65"
                      }`}
                      key={markerKey}
                      style={{
                        left: `${marker.x}%`,
                        top: `${marker.y}%`,
                      }}
                    >
                      {marker.markerName}
                    </span>
                  );
                })}

                {plottedLocations.map((location) =>
                  location.displayMarker ? (
                    <div
                      className="group absolute z-20 -translate-x-1/2 -translate-y-full"
                      key={location.id}
                      style={{
                        left: `${location.displayMarker.x}%`,
                        top: `${location.displayMarker.y}%`,
                      }}
                    >
                      <Link
                        aria-label={`${location.label}, ${statusLabels[location.status]}, ${location.positionName}`}
                        className={`relative flex size-10 cursor-pointer items-center justify-center rounded-full border-[3px] text-xs font-black text-white shadow-[0_4px_16px_rgba(0,0,0,0.9)] after:absolute after:-bottom-2 after:left-1/2 after:size-3 after:-translate-x-1/2 after:rotate-45 after:border-b-[3px] after:border-r-[3px] after:border-inherit after:bg-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${technicianStyles[location.id].marker} ${
                          location.status === "working"
                            ? "border-dashed opacity-65 after:border-dashed"
                            : "border-solid"
                        }`}
                        href="/technician"
                        onClick={() =>
                          setSelectedTemporaryTechnician(location.id)
                        }
                      >
                        {location.shortLabel}
                      </Link>
                      <Link
                        className={`invisible absolute bottom-12 left-1/2 z-30 hidden w-64 -translate-x-1/2 translate-y-2 cursor-pointer rounded-lg border p-3 opacity-0 shadow-2xl shadow-black/70 transition duration-200 ease-out group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 lg:block ${technicianStyles[location.id].accent}`}
                        href="/technician"
                        onClick={() =>
                          setSelectedTemporaryTechnician(location.id)
                        }
                      >
                        <div className="flex items-center gap-3">
                          <div
                            aria-hidden="true"
                            className={`flex size-11 shrink-0 items-center justify-center rounded-lg border-2 text-xs font-black text-white ${technicianStyles[location.id].marker}`}
                          >
                            {location.shortLabel}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-white">
                              {location.label}
                            </p>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#cbd5e1]">
                              {statusLabels[location.status]}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 grid gap-1 border-t border-white/10 pt-2 text-xs text-[#dbe4ef]">
                          <p>
                            <span className="text-[#94a3b8]">
                              {location.status === "last-known"
                                ? "Last Location: "
                                : "Location: "}
                            </span>
                            <strong>{location.positionName ?? "—"}</strong>
                          </p>
                          {location.status !== "last-known" &&
                          location.channelNumber !== null &&
                          location.cueValue ? (
                            <p>
                              CH{" "}
                              <strong className="text-[#f28b82]">
                                {location.channelNumber}
                              </strong>
                              <span className="text-[#64748b]"> | </span>
                              Cue(s){" "}
                              <strong className="text-[#f28b82]">
                                {location.cueValue}
                              </strong>
                            </p>
                          ) : null}
                          {location.status !== "last-known" &&
                          location.issueType ? (
                            <p className="font-semibold text-[#f28b82]">
                              {formatIssueLabel(location.issueType)}
                            </p>
                          ) : null}
                          {location.status === "awaiting-director" ? (
                            <p className="font-semibold text-[#fde68a]">
                              Waiting for Director response
                            </p>
                          ) : formatMapElapsedTime(
                            location.activityStartedAt,
                            now,
                          ) ? (
                            <p className="font-mono text-[#cbd5e1]">
                              {location.status === "working"
                                ? "Working"
                                : location.status === "last-known"
                                  ? "Last seen"
                                  : "Idle"}{" "}
                              for{" "}
                              {formatMapElapsedTime(
                                location.activityStartedAt,
                                now,
                              )}
                            </p>
                          ) : null}
                          <p>
                            <span className="text-[#94a3b8]">
                              Resolved:{" "}
                            </span>
                            <strong>{location.resolvedCount}</strong>
                          </p>
                        </div>
                      </Link>
                    </div>
                  ) : null,
                )}
              </div>
            )}
            <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.08em] text-[#64748b]">
              Solid = available / last known
              <span className="mx-2 text-white/20">|</span>
              Dashed = working
            </p>
          </div>

          <aside className="rounded-lg border border-white/10 bg-[#070b18] p-4">
            <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-[#a78bfa]">
              Tech Status
            </h3>
            <div className="mt-3 grid gap-2">
              {plottedLocations.map((location) => {
                const displayStatus =
                  location.status === "awaiting-director" ||
                  location.marker
                    ? statusLabels[location.status]
                    : "Ready to Deploy";

                return (
                  <Link
                    aria-label={`Open Technician Console as ${location.label}`}
                    className={`block cursor-pointer rounded-lg border p-3 transition duration-150 hover:brightness-110 hover:shadow-[0_0_16px_rgba(167,139,250,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a78bfa] ${technicianStyles[location.id].accent}`}
                    href="/technician"
                    key={location.id}
                    onClick={() =>
                      setSelectedTemporaryTechnician(location.id)
                    }
                  >
                    <div className="flex items-center gap-3">
                      <div
                        aria-hidden="true"
                        className={`flex size-10 shrink-0 items-center justify-center rounded-lg border-2 text-xs font-black text-white ${technicianStyles[location.id].marker}`}
                      >
                        {location.shortLabel}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-white">
                          {location.label}
                        </p>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#cbd5e1]">
                          {displayStatus}
                        </p>
                      </div>
                    </div>

                    <div className="mt-2 grid gap-1 border-t border-white/10 pt-2 text-xs">
                      {location.positionName ? (
                        <p className="text-[#dbe4ef]">
                          <span className="text-[#94a3b8]">
                            {location.status === "last-known"
                              ? "Last Location: "
                              : "Location: "}
                          </span>
                          <strong>{location.positionName}</strong>
                        </p>
                      ) : (
                        <p className="font-semibold text-[#cbd5e1]">
                          Ready to Deploy
                        </p>
                      )}
                      {location.status !== "last-known" &&
                      location.channelNumber !== null &&
                      location.cueValue ? (
                        <p className="text-[#dbe4ef]">
                          CH{" "}
                          <strong className="text-[#f28b82]">
                            {location.channelNumber}
                          </strong>
                          <span className="text-[#64748b]"> | </span>
                          Cue(s){" "}
                          <strong className="text-[#f28b82]">
                            {location.cueValue}
                          </strong>
                        </p>
                      ) : null}
                      {location.status !== "last-known" &&
                      location.issueType ? (
                        <p className="font-semibold text-[#f28b82]">
                          {formatIssueLabel(location.issueType)}
                        </p>
                      ) : null}
                      {location.status === "awaiting-director" ? (
                        <p className="font-semibold text-[#fde68a]">
                          Waiting for Director response
                        </p>
                      ) : null}
                      {!location.marker && location.positionName ? (
                        <p className="text-[#fbbf24]">
                          {location.status === "last-known"
                            ? "Last known position not mapped"
                            : "Position not mapped"}
                        </p>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
