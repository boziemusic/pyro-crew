"use client";

import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import { useActiveShow } from "@/components/active-show-strip";
import {
  createFieldPosition,
  createPositionGroup,
  deleteFieldPosition,
  deletePositionGroup,
  moveFieldPosition,
  moveFieldPositions,
  renameFieldPosition,
  renamePositionGroup,
  syncScriptPositions,
  type FieldPosition,
  type PositionImportSummary,
  type PositionGroup,
  useShowPositions,
} from "@/components/position-store";
import { PositionsMap } from "@/components/positions-map";
import { fetchScriptPositionNames } from "@/lib/script-events";
import { createSupabaseBrowserClient } from "@/lib/supabase";

const fieldClassName =
  "h-11 rounded-md border border-white/15 bg-[#070b18] px-3 text-base font-semibold text-white outline-none placeholder:text-[#64748b] focus:border-[#a78bfa] focus:ring-2 focus:ring-[#4c00a4]/35";

type ViewMode = "director" | "technician";

type ScriptPositionState = {
  error: string | null;
  names: string[];
  showId: string | null;
};

type ImportResult = {
  mode: "automatic" | "manual";
  showId: string;
  summary: PositionImportSummary;
};

export default function PositionsPage() {
  const activeShow = useActiveShow();
  const showData = useShowPositions(activeShow?.id);
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [viewMode, setViewMode] = useState<ViewMode>("director");
  const [groupName, setGroupName] = useState("");
  const [positionName, setPositionName] = useState("");
  const [positionGroupId, setPositionGroupId] = useState("");
  const [positionSearch, setPositionSearch] = useState("");
  const [selectedPositionIdsByShow, setSelectedPositionIdsByShow] = useState<
    Record<string, string[]>
  >({});
  const [lastSelectedPositionIdByShow, setLastSelectedPositionIdByShow] =
    useState<Record<string, string | null>>({});
  const [openSectionsByShow, setOpenSectionsByShow] = useState<
    Record<string, string[]>
  >({});
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingPositionId, setEditingPositionId] = useState<string | null>(
    null,
  );
  const [editValue, setEditValue] = useState("");
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [scriptPositionState, setScriptPositionState] =
    useState<ScriptPositionState>({
      error: null,
      names: [],
      showId: null,
    });
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    if (!activeShow?.id) {
      return;
    }

    let isCurrent = true;

    const loadScriptPositions = async () => {
      const { data, error } = await fetchScriptPositionNames(
        supabase,
        activeShow.id,
      );

      if (!isCurrent) {
        return;
      }

      if (error) {
        setScriptPositionState({
          error: `Script positions could not be loaded: ${error.message}`,
          names: [],
          showId: activeShow.id,
        });
        return;
      }

      const uniqueNames = new Map<string, string>();

      (data ?? []).forEach((row) => {
        const name =
          typeof row.position_name === "string"
            ? row.position_name.trim()
            : "";

        if (name) {
          uniqueNames.set(name.toLocaleLowerCase(), name);
        }
      });

      const names = Array.from(uniqueNames.values());
      const summary = syncScriptPositions(activeShow.id, names);

      setScriptPositionState({
        error: null,
        names,
        showId: activeShow.id,
      });
      setImportResult({
        mode: "automatic",
        showId: activeShow.id,
        summary,
      });

      if (summary.positionsImported > 0) {
        setOpenSectionsByShow((current) => ({
          ...current,
          [activeShow.id]: Array.from(
            new Set([...(current[activeShow.id] ?? []), "ungrouped"]),
          ),
        }));
      }
    };

    void loadScriptPositions();

    return () => {
      isCurrent = false;
    };
  }, [activeShow?.id, supabase]);

  if (!activeShow) {
    return null;
  }

  const isDirector = viewMode === "director";
  const scriptPositionNames =
    scriptPositionState.showId === activeShow.id
      ? scriptPositionState.names
      : [];
  const scriptPositionsLoading =
    scriptPositionState.showId !== activeShow.id;
  const scriptPositionsError =
    scriptPositionState.showId === activeShow.id
      ? scriptPositionState.error
      : null;
  const importSummary =
    importResult?.showId === activeShow.id ? importResult.summary : null;
  const importMode =
    importResult?.showId === activeShow.id ? importResult.mode : null;
  const normalizedSearch = positionSearch.trim().toLocaleLowerCase();
  const selectedPositionGroupId = showData.groups.some(
    (group) => group.id === positionGroupId,
  )
    ? positionGroupId
    : "";
  const ungroupedPositions = showData.positions.filter(
    (position) => !position.groupId,
  );
  const positionSections = [
    ...showData.groups.map((group) => ({
      group,
      key: group.id,
      positions: showData.positions.filter(
        (position) => position.groupId === group.id,
      ),
    })),
    {
      group: null,
      key: "ungrouped",
      positions: ungroupedPositions,
    },
  ]
    .map((section) => {
      if (!normalizedSearch) {
        return {
          ...section,
          searchMatchesGroup: false,
        };
      }

      const sectionName =
        section.group?.name ?? "Ungrouped Positions";
      const groupMatches = sectionName
        .toLocaleLowerCase()
        .includes(normalizedSearch);

      return {
        ...section,
        positions: groupMatches
          ? section.positions
          : section.positions.filter((position) =>
              position.name.toLocaleLowerCase().includes(normalizedSearch),
            ),
        searchMatchesGroup: groupMatches,
      };
    })
    .filter(
      (section) =>
        !normalizedSearch ||
        section.searchMatchesGroup ||
        section.positions.length > 0,
    );
  const openSectionKeys =
    openSectionsByShow[activeShow.id] ?? ["ungrouped"];
  const visiblePositionIds = positionSections.flatMap((section) =>
    normalizedSearch || openSectionKeys.includes(section.key)
      ? section.positions.map((position) => position.id)
      : [],
  );
  const existingPositionIds = new Set(
    showData.positions.map((position) => position.id),
  );
  const selectedPositionIds = (
    selectedPositionIdsByShow[activeShow.id] ?? []
  ).filter((positionId) => existingPositionIds.has(positionId));
  const selectedPositionIdSet = new Set(selectedPositionIds);

  const handleCreateGroup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!groupName.trim()) {
      setFeedback({ type: "error", message: "Position group name is required." });
      return;
    }

    createPositionGroup(activeShow.id, groupName);
    setGroupName("");
    setFeedback({ type: "success", message: "Position group created." });
  };

  const handleCreatePosition = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!positionName.trim()) {
      setFeedback({ type: "error", message: "Position name is required." });
      return;
    }

    createFieldPosition(
      activeShow.id,
      selectedPositionGroupId || null,
      positionName,
    );
    setPositionName("");
    setFeedback({ type: "success", message: "Field position created." });
  };

  const beginEdit = (id: string, value: string, type: "group" | "position") => {
    setEditingGroupId(type === "group" ? id : null);
    setEditingPositionId(type === "position" ? id : null);
    setEditValue(value);
    setFeedback(null);
  };

  const cancelEdit = () => {
    setEditingGroupId(null);
    setEditingPositionId(null);
    setEditValue("");
  };

  const saveGroupName = (groupId: string) => {
    if (!editValue.trim()) {
      setFeedback({ type: "error", message: "Group name cannot be empty." });
      return;
    }

    renamePositionGroup(activeShow.id, groupId, editValue);
    cancelEdit();
    setFeedback({ type: "success", message: "Position group renamed." });
  };

  const savePositionName = (positionId: string) => {
    if (!editValue.trim()) {
      setFeedback({ type: "error", message: "Position name cannot be empty." });
      return;
    }

    renameFieldPosition(activeShow.id, positionId, editValue);
    cancelEdit();
    setFeedback({ type: "success", message: "Position renamed." });
  };

  const toggleSection = (sectionKey: string) => {
    setOpenSectionsByShow((current) => {
      const openSections = current[activeShow.id] ?? ["ungrouped"];
      const nextSections = openSections.includes(sectionKey)
        ? openSections.filter((key) => key !== sectionKey)
        : [...openSections, sectionKey];

      return {
        ...current,
        [activeShow.id]: nextSections,
      };
    });
  };

  const setSelectedPositionIds = (positionIds: string[]) => {
    setSelectedPositionIdsByShow((current) => ({
      ...current,
      [activeShow.id]: Array.from(new Set(positionIds)),
    }));
  };

  const togglePositionSelection = (
    positionId: string,
    shiftKey: boolean,
  ) => {
    const selectedIds = new Set(selectedPositionIds);
    const lastSelectedId = lastSelectedPositionIdByShow[activeShow.id];

    if (shiftKey && lastSelectedId) {
      const startIndex = visiblePositionIds.indexOf(lastSelectedId);
      const endIndex = visiblePositionIds.indexOf(positionId);

      if (startIndex >= 0 && endIndex >= 0) {
        const rangeStart = Math.min(startIndex, endIndex);
        const rangeEnd = Math.max(startIndex, endIndex);

        visiblePositionIds
          .slice(rangeStart, rangeEnd + 1)
          .forEach((id) => selectedIds.add(id));
      } else if (selectedIds.has(positionId)) {
        selectedIds.delete(positionId);
      } else {
        selectedIds.add(positionId);
      }
    } else if (selectedIds.has(positionId)) {
      selectedIds.delete(positionId);
    } else {
      selectedIds.add(positionId);
    }

    setSelectedPositionIds(Array.from(selectedIds));
    setLastSelectedPositionIdByShow((current) => ({
      ...current,
      [activeShow.id]: positionId,
    }));
  };

  const clearSelection = () => {
    setSelectedPositionIds([]);
    setLastSelectedPositionIdByShow((current) => ({
      ...current,
      [activeShow.id]: null,
    }));
  };

  const handleBulkMove = (groupId: string | null) => {
    const movedPositionCount = selectedPositionIds.length;

    moveFieldPositions(activeShow.id, selectedPositionIds, groupId);
    setFeedback({
      type: "success",
      message: `${movedPositionCount} position${
        movedPositionCount === 1 ? "" : "s"
      } ${groupId ? "moved to the selected group" : "ungrouped"}.`,
    });
    clearSelection();
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 sm:px-8 lg:py-8">
      <section className="rounded-lg border border-white/10 bg-[#0b1020]/90 p-6 shadow-2xl shadow-black/25">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#a78bfa]">
              Positions
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
              Set the field
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-[#b6c3d1]">
              Organize physical launch positions for {activeShow.name}.
              Position groups are optional.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:items-end">
            <div
              aria-label="Position page view"
              className="inline-flex rounded-md border border-white/10 bg-[#070b18] p-1"
              role="group"
            >
              {(["director", "technician"] as ViewMode[]).map((mode) => (
                <button
                  className={`rounded px-3 py-2 text-sm font-semibold transition ${
                    viewMode === mode
                      ? "bg-[#6d28d9] text-white"
                      : "text-[#94a3b8] hover:text-white"
                  }`}
                  key={mode}
                  onClick={() => {
                    setViewMode(mode);
                    cancelEdit();
                    setFeedback(null);
                  }}
                  type="button"
                >
                  {mode === "director" ? "Director View" : "Technician View"}
                </button>
              ))}
            </div>
            <p className="text-xs text-[#94a3b8]">
              {showData.groups.length} groups | {showData.positions.length} positions
            </p>
          </div>
        </div>
      </section>

      {isDirector ? (
        <>
          {scriptPositionNames.length > 0 ? (
            <section className="rounded-lg border border-[#8b5cf6]/30 bg-[#140d2a]/80 p-5 shadow-xl shadow-black/20">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Script Positions Available
                  </h2>
                  <p className="mt-1 text-sm text-[#b6c3d1]">
                    {scriptPositionNames.length} unique physical position
                    {scriptPositionNames.length === 1 ? "" : "s"} found in the
                    active show script. Positions sync automatically; new
                    positions start ungrouped.
                  </p>
                </div>
                <button
                  className="shrink-0 rounded-md bg-[#6d28d9] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#7c3aed]"
                  onClick={() => {
                    const summary = syncScriptPositions(
                      activeShow.id,
                      scriptPositionNames,
                    );
                    setImportResult({
                      mode: "manual",
                      showId: activeShow.id,
                      summary,
                    });
                    if (summary.positionsImported > 0) {
                      setOpenSectionsByShow((current) => ({
                        ...current,
                        [activeShow.id]: Array.from(
                          new Set([
                            ...(current[activeShow.id] ?? []),
                            "ungrouped",
                          ]),
                        ),
                      }));
                    }
                    setFeedback(null);
                  }}
                  type="button"
                >
                  Re-import Positions From Script
                </button>
              </div>

              {importSummary ? (
                <div className="mt-4 border-t border-white/10 pt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#a78bfa]">
                    {importMode === "manual"
                      ? "Re-import complete"
                      : "Automatic sync complete"}
                  </p>
                  <div className="grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
                  <p className="text-[#cbd5e1]">
                    Positions found:{" "}
                    <strong className="text-white">
                      {importSummary.positionsFound}
                    </strong>
                  </p>
                  <p className="text-[#cbd5e1]">
                    New positions imported:{" "}
                    <strong className="text-[#86efac]">
                      {importSummary.positionsImported}
                    </strong>
                  </p>
                  <p className="text-[#cbd5e1]">
                    Duplicates skipped:{" "}
                    <strong className="text-[#fcd34d]">
                      {importSummary.duplicatesSkipped}
                    </strong>
                  </p>
                  <p className="text-[#cbd5e1]">
                    Stale script positions removed:{" "}
                    <strong className="text-[#fca5a5]">
                      {importSummary.stalePositionsRemoved}
                    </strong>
                  </p>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {scriptPositionsLoading ? (
            <p className="text-sm text-[#94a3b8]">
              Checking the active show script for field positions...
            </p>
          ) : null}

          {scriptPositionsError ? (
            <p className="rounded-lg border border-[#ef4444]/35 bg-[#2a0b13] px-4 py-3 text-sm font-semibold text-[#fecaca]">
              {scriptPositionsError}
            </p>
          ) : null}

          <section className="grid gap-5 lg:grid-cols-2">
            <form
              className="rounded-lg border border-white/10 bg-[#0b1020]/90 p-5 shadow-xl shadow-black/20"
              onSubmit={handleCreateGroup}
            >
              <h2 className="text-lg font-semibold text-white">
                Create Position Group
              </h2>
              <p className="mt-1 text-sm text-[#94a3b8]">
                Optional container for related physical positions.
              </p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <input
                  className={`${fieldClassName} min-w-0 flex-1`}
                  onChange={(event) => setGroupName(event.target.value)}
                  placeholder="Example: F1"
                  value={groupName}
                />
                <button
                  className="rounded-md bg-[#6d28d9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#7c3aed]"
                  type="submit"
                >
                  Create Group
                </button>
              </div>
            </form>

            <form
              className="rounded-lg border border-white/10 bg-[#0b1020]/90 p-5 shadow-xl shadow-black/20"
              onSubmit={handleCreatePosition}
            >
              <h2 className="text-lg font-semibold text-white">
                Create Position
              </h2>
              <p className="mt-1 text-sm text-[#94a3b8]">
                Add directly to a group or leave the position ungrouped.
              </p>
              <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
                <input
                  className={`${fieldClassName} min-w-0 w-full`}
                  onChange={(event) => setPositionName(event.target.value)}
                  placeholder="Example: F1a"
                  value={positionName}
                />
                <select
                  className={`${fieldClassName} min-w-0 w-full`}
                  onChange={(event) => setPositionGroupId(event.target.value)}
                  value={selectedPositionGroupId}
                >
                  <option value="">Ungrouped</option>
                  {showData.groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
                <button
                  className="w-full rounded-md bg-[#6d28d9] px-4 py-3 text-sm font-semibold text-white hover:bg-[#7c3aed] sm:col-span-2"
                  type="submit"
                >
                  Add Position
                </button>
              </div>
            </form>
          </section>
        </>
      ) : null}

      {feedback ? (
        <p
          className={`rounded-lg border px-4 py-3 text-sm font-semibold ${
            feedback.type === "success"
              ? "border-[#22c55e]/35 bg-[#082515] text-[#bbf7d0]"
              : "border-[#ef4444]/35 bg-[#2a0b13] text-[#fecaca]"
          }`}
        >
          {feedback.message}
        </p>
      ) : null}

      <PositionsMap
        groups={showData.groups}
        isDirector={isDirector}
        positions={showData.positions}
        showId={activeShow.id}
      />

      <section className="rounded-lg border border-white/10 bg-[#0b1020]/90 p-5 shadow-xl shadow-black/20">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Field Positions</h2>
            <p className="mt-1 text-sm text-[#94a3b8]">
              {isDirector
                ? "Manage field organization for the active show."
                : "Read-only field reference for technicians."}
            </p>
          </div>
          <label className="w-full md:max-w-sm">
            <span className="sr-only">Search field positions</span>
            <input
              className={`${fieldClassName} w-full`}
              onChange={(event) => setPositionSearch(event.target.value)}
              placeholder="Search positions or groups"
              type="search"
              value={positionSearch}
            />
          </label>
        </div>

        {isDirector ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-white/10 py-3">
            <button
              className="rounded-md border border-white/15 px-3 py-2 text-xs font-semibold text-[#dbe4ef] transition hover:border-[#8b5cf6]/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              disabled={visiblePositionIds.length === 0}
              onClick={() =>
                setSelectedPositionIds([
                  ...selectedPositionIds,
                  ...visiblePositionIds,
                ])
              }
              type="button"
            >
              Select All Visible
            </button>
            {selectedPositionIds.length > 0 ? (
              <button
                className="rounded-md border border-white/15 px-3 py-2 text-xs font-semibold text-[#94a3b8] transition hover:text-white"
                onClick={clearSelection}
                type="button"
              >
                Clear Selection
              </button>
            ) : null}
            <p className="ml-auto text-xs text-[#64748b]">
              {visiblePositionIds.length} visible
            </p>
          </div>
        ) : null}

        {isDirector && selectedPositionIds.length > 0 ? (
          <div className="mt-4 flex flex-col gap-3 rounded-lg border border-[#8b5cf6]/35 bg-[#160d2d] p-4 sm:flex-row sm:items-center">
            <p className="font-semibold text-white">
              {selectedPositionIds.length} position
              {selectedPositionIds.length === 1 ? "" : "s"} selected
            </p>
            <div className="flex flex-1 flex-wrap gap-2 sm:justify-end">
              <select
                aria-label="Move selected positions to group"
                className="h-10 min-w-48 rounded-md border border-[#8b5cf6]/45 bg-[#070b18] px-3 text-sm font-semibold text-white outline-none focus:border-[#a78bfa]"
                onChange={(event) => {
                  if (event.target.value) {
                    handleBulkMove(event.target.value);
                    event.target.value = "";
                  }
                }}
                value=""
              >
                <option value="">Move To Group</option>
                {showData.groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
              <button
                className="rounded-md border border-[#f59e0b]/40 bg-[#3a2407]/70 px-4 py-2 text-sm font-semibold text-[#fde68a] transition hover:border-[#f59e0b]/70"
                onClick={() => handleBulkMove(null)}
                type="button"
              >
                Ungroup
              </button>
              <button
                className="rounded-md border border-white/15 px-4 py-2 text-sm font-semibold text-[#cbd5e1] transition hover:text-white"
                onClick={clearSelection}
                type="button"
              >
                Clear Selection
              </button>
            </div>
          </div>
        ) : null}

        {showData.groups.length === 0 && showData.positions.length === 0 ? (
          <div className="mt-5 rounded-lg border border-dashed border-white/15 bg-[#070b18] p-8 text-center">
            <p className="font-semibold text-[#dbe4ef]">
              No physical positions have been set for this show.
            </p>
          </div>
        ) : positionSections.length === 0 ? (
          <div className="mt-5 rounded-lg border border-dashed border-white/15 bg-[#070b18] p-8 text-center">
            <p className="font-semibold text-[#dbe4ef]">
              No positions or groups match “{positionSearch.trim()}”.
            </p>
          </div>
        ) : (
          <div className="mt-5 grid gap-3">
            {positionSections.map(({ group, key, positions }) => {
              const isOpen =
                Boolean(normalizedSearch) ||
                (openSectionsByShow[activeShow.id] ?? ["ungrouped"]).includes(
                  key,
                );

              return (
              <PositionSection
                activeShowId={activeShow.id}
                allGroups={showData.groups}
                editingGroupId={editingGroupId}
                editingPositionId={editingPositionId}
                editValue={editValue}
                group={group}
                isOpen={isOpen}
                isDirector={isDirector}
                key={key}
                onBeginEdit={beginEdit}
                onCancelEdit={cancelEdit}
                onDeleteGroup={
                  group
                    ? () => {
                        deletePositionGroup(activeShow.id, group.id);
                        setFeedback({
                          type: "success",
                          message: `${group.name} deleted. Its positions are now ungrouped.`,
                        });
                      }
                    : () => undefined
                }
                onEditValueChange={setEditValue}
                onToggle={() => toggleSection(key)}
                onSaveGroup={saveGroupName}
                onSavePosition={savePositionName}
                onFeedback={setFeedback}
                onTogglePositionSelection={togglePositionSelection}
                positions={positions}
                selectedPositionIds={selectedPositionIdSet}
              />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function PositionSection({
  activeShowId,
  allGroups,
  editingGroupId,
  editingPositionId,
  editValue,
  group,
  isOpen,
  isDirector,
  onBeginEdit,
  onCancelEdit,
  onDeleteGroup,
  onEditValueChange,
  onFeedback,
  onSaveGroup,
  onSavePosition,
  onToggle,
  onTogglePositionSelection,
  positions,
  selectedPositionIds,
}: {
  activeShowId: string;
  allGroups: PositionGroup[];
  editingGroupId: string | null;
  editingPositionId: string | null;
  editValue: string;
  group: PositionGroup | null;
  isOpen: boolean;
  isDirector: boolean;
  onBeginEdit: (id: string, value: string, type: "group" | "position") => void;
  onCancelEdit: () => void;
  onDeleteGroup: () => void;
  onEditValueChange: (value: string) => void;
  onFeedback: (feedback: { type: "success" | "error"; message: string }) => void;
  onSaveGroup: (groupId: string) => void;
  onSavePosition: (positionId: string) => void;
  onToggle: () => void;
  onTogglePositionSelection: (
    positionId: string,
    shiftKey: boolean,
  ) => void;
  positions: FieldPosition[];
  selectedPositionIds: ReadonlySet<string>;
}) {
  const isEditingGroup = group && editingGroupId === group.id;

  return (
    <article className="overflow-hidden rounded-lg border border-white/10 bg-[#070b18]">
      <div
        className={`flex items-start justify-between gap-3 px-4 py-4 ${
          isOpen ? "border-b border-white/10" : ""
        }`}
      >
        <div className="min-w-0 flex-1">
          {isEditingGroup ? (
            <input
              autoFocus
              className="h-9 w-full rounded-md border border-[#8b5cf6]/50 bg-[#020617] px-3 text-sm font-semibold text-white outline-none"
              onChange={(event) => onEditValueChange(event.target.value)}
              value={editValue}
            />
          ) : (
            <button
              aria-expanded={isOpen}
              className="flex w-full items-center gap-3 text-left"
              onClick={onToggle}
              type="button"
            >
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded border border-white/15 bg-[#0b1020] text-sm font-semibold text-[#c4b5fd]"
              >
                {isOpen ? "-" : "+"}
              </span>
              <span>
                <span className="block text-base font-semibold text-white">
                  {group?.name ?? "Ungrouped Positions"}
                </span>
                <span className="mt-1 block text-xs text-[#94a3b8]">
                  {positions.length} position
                  {positions.length === 1 ? "" : "s"}
                </span>
              </span>
            </button>
          )}
        </div>
        {isDirector && group ? (
          <div className="flex gap-2">
            {isEditingGroup ? (
              <>
                <SmallButton onClick={() => onSaveGroup(group.id)}>
                  Save
                </SmallButton>
                <SmallButton onClick={onCancelEdit} secondary>
                  Cancel
                </SmallButton>
              </>
            ) : (
              <>
                <SmallButton
                  onClick={() => onBeginEdit(group.id, group.name, "group")}
                  secondary
                >
                  Rename
                </SmallButton>
                <SmallButton onClick={onDeleteGroup} danger>
                  Delete
                </SmallButton>
              </>
            )}
          </div>
        ) : null}
      </div>

      {isOpen ? (
      <div className="grid gap-2 p-4">
        {positions.length === 0 ? (
          <p className="rounded-md border border-dashed border-white/10 p-4 text-sm text-[#64748b]">
            No positions in this section.
          </p>
        ) : (
          positions.map((position) => {
            const isEditing = editingPositionId === position.id;
            const isSelected = selectedPositionIds.has(position.id);

            return (
              <div
                className={`rounded-md border p-3 transition ${
                  isSelected
                    ? "border-[#8b5cf6]/70 bg-[#211044] shadow-[0_0_0_1px_rgba(139,92,246,0.15)]"
                    : "border-white/10 bg-[#0b1020]"
                }`}
                key={position.id}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    {isDirector ? (
                      <input
                        aria-label={`Select ${position.name}`}
                        checked={isSelected}
                        className="size-4 shrink-0 cursor-pointer accent-[#8b5cf6]"
                        onClick={(event) => {
                          event.stopPropagation();
                          onTogglePositionSelection(
                            position.id,
                            event.shiftKey,
                          );
                        }}
                        readOnly
                        type="checkbox"
                      />
                    ) : null}
                    {isEditing ? (
                      <input
                        autoFocus
                        className="h-9 min-w-0 flex-1 rounded-md border border-[#8b5cf6]/50 bg-[#020617] px-3 text-sm font-semibold text-white outline-none"
                        onChange={(event) =>
                          onEditValueChange(event.target.value)
                        }
                        value={editValue}
                      />
                    ) : (
                      <span className="min-w-0 font-semibold text-[#f8fafc]">
                        {position.name}
                      </span>
                    )}
                  </div>

                  {isDirector ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {isEditing ? (
                        <>
                          <SmallButton onClick={() => onSavePosition(position.id)}>
                            Save
                          </SmallButton>
                          <SmallButton onClick={onCancelEdit} secondary>
                            Cancel
                          </SmallButton>
                        </>
                      ) : (
                        <>
                          <select
                            className="h-9 rounded-md border border-white/15 bg-[#020617] px-2 text-sm font-semibold text-white outline-none focus:border-[#a78bfa]"
                            onChange={(event) => {
                              moveFieldPosition(
                                activeShowId,
                                position.id,
                                event.target.value || null,
                              );
                              onFeedback({
                                type: "success",
                                message: `${position.name} moved.`,
                              });
                            }}
                            value={position.groupId ?? ""}
                          >
                            <option value="">Ungrouped</option>
                            {allGroups.map((targetGroup) => (
                              <option key={targetGroup.id} value={targetGroup.id}>
                                {targetGroup.name}
                              </option>
                            ))}
                          </select>
                          <SmallButton
                            onClick={() =>
                              onBeginEdit(position.id, position.name, "position")
                            }
                            secondary
                          >
                            Edit
                          </SmallButton>
                          <SmallButton
                            onClick={() => {
                              deleteFieldPosition(activeShowId, position.id);
                              onFeedback({
                                type: "success",
                                message: `${position.name} deleted.`,
                              });
                            }}
                            danger
                          >
                            Delete
                          </SmallButton>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
      ) : null}
    </article>
  );
}

function SmallButton({
  children,
  danger = false,
  onClick,
  secondary = false,
}: {
  children: ReactNode;
  danger?: boolean;
  onClick: () => void;
  secondary?: boolean;
}) {
  const className = danger
    ? "border-[#ef4444]/35 text-[#fecaca]"
    : secondary
      ? "border-white/15 text-[#cbd5e1]"
      : "border-[#8b5cf6]/45 bg-[#4c00a4]/35 text-white";

  return (
    <button
      className={`rounded-md border px-3 py-2 text-xs font-semibold ${className}`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
