"use client";

import { type FormEvent, type ReactNode, useState } from "react";
import { useActiveShow } from "@/components/active-show-strip";
import {
  createFieldPosition,
  createPositionGroup,
  deleteFieldPosition,
  deletePositionGroup,
  moveFieldPosition,
  renameFieldPosition,
  renamePositionGroup,
  type FieldPosition,
  type PositionGroup,
  useShowPositions,
} from "@/components/position-store";

const fieldClassName =
  "h-11 rounded-md border border-white/15 bg-[#070b18] px-3 text-base font-semibold text-white outline-none placeholder:text-[#64748b] focus:border-[#a78bfa] focus:ring-2 focus:ring-[#4c00a4]/35";

type ViewMode = "director" | "technician";

export default function PositionsPage() {
  const activeShow = useActiveShow();
  const showData = useShowPositions(activeShow?.id);
  const [viewMode, setViewMode] = useState<ViewMode>("director");
  const [groupName, setGroupName] = useState("");
  const [positionName, setPositionName] = useState("");
  const [positionGroupId, setPositionGroupId] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingPositionId, setEditingPositionId] = useState<string | null>(
    null,
  );
  const [editValue, setEditValue] = useState("");
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  if (!activeShow) {
    return null;
  }

  const isDirector = viewMode === "director";
  const ungroupedPositions = showData.positions.filter(
    (position) => !position.groupId,
  );

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
      positionGroupId || null,
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
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_0.8fr_auto]">
              <input
                className={fieldClassName}
                onChange={(event) => setPositionName(event.target.value)}
                placeholder="Example: F1a"
                value={positionName}
              />
              <select
                className={fieldClassName}
                onChange={(event) => setPositionGroupId(event.target.value)}
                value={positionGroupId}
              >
                <option value="">Ungrouped</option>
                {showData.groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
              <button
                className="rounded-md bg-[#6d28d9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#7c3aed]"
                type="submit"
              >
                Add Position
              </button>
            </div>
          </form>
        </section>
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

      <section className="rounded-lg border border-white/10 bg-[#0b1020]/90 p-5 shadow-xl shadow-black/20">
        <div className="border-b border-white/10 pb-4">
          <h2 className="text-xl font-semibold text-white">Field Positions</h2>
          <p className="mt-1 text-sm text-[#94a3b8]">
            {isDirector
              ? "Manage field organization for the active show."
              : "Read-only field reference for technicians."}
          </p>
        </div>

        {showData.groups.length === 0 && showData.positions.length === 0 ? (
          <div className="mt-5 rounded-lg border border-dashed border-white/15 bg-[#070b18] p-8 text-center">
            <p className="font-semibold text-[#dbe4ef]">
              No physical positions have been set for this show.
            </p>
          </div>
        ) : (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {showData.groups.map((group) => (
              <PositionSection
                activeShowId={activeShow.id}
                allGroups={showData.groups}
                editingGroupId={editingGroupId}
                editingPositionId={editingPositionId}
                editValue={editValue}
                group={group}
                isDirector={isDirector}
                key={group.id}
                onBeginEdit={beginEdit}
                onCancelEdit={cancelEdit}
                onDeleteGroup={() => {
                  deletePositionGroup(activeShow.id, group.id);
                  setFeedback({
                    type: "success",
                    message: `${group.name} deleted. Its positions are now ungrouped.`,
                  });
                }}
                onEditValueChange={setEditValue}
                onSaveGroup={saveGroupName}
                onSavePosition={savePositionName}
                onFeedback={setFeedback}
                positions={showData.positions.filter(
                  (position) => position.groupId === group.id,
                )}
              />
            ))}

            <PositionSection
              activeShowId={activeShow.id}
              allGroups={showData.groups}
              editingGroupId={editingGroupId}
              editingPositionId={editingPositionId}
              editValue={editValue}
              group={null}
              isDirector={isDirector}
              onBeginEdit={beginEdit}
              onCancelEdit={cancelEdit}
              onDeleteGroup={() => undefined}
              onEditValueChange={setEditValue}
              onSaveGroup={saveGroupName}
              onSavePosition={savePositionName}
              onFeedback={setFeedback}
              positions={ungroupedPositions}
            />
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
  isDirector,
  onBeginEdit,
  onCancelEdit,
  onDeleteGroup,
  onEditValueChange,
  onFeedback,
  onSaveGroup,
  onSavePosition,
  positions,
}: {
  activeShowId: string;
  allGroups: PositionGroup[];
  editingGroupId: string | null;
  editingPositionId: string | null;
  editValue: string;
  group: PositionGroup | null;
  isDirector: boolean;
  onBeginEdit: (id: string, value: string, type: "group" | "position") => void;
  onCancelEdit: () => void;
  onDeleteGroup: () => void;
  onEditValueChange: (value: string) => void;
  onFeedback: (feedback: { type: "success" | "error"; message: string }) => void;
  onSaveGroup: (groupId: string) => void;
  onSavePosition: (positionId: string) => void;
  positions: FieldPosition[];
}) {
  const isEditingGroup = group && editingGroupId === group.id;

  return (
    <article className="rounded-lg border border-white/10 bg-[#070b18] p-4">
      <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
        <div className="min-w-0 flex-1">
          {isEditingGroup ? (
            <input
              autoFocus
              className="h-9 w-full rounded-md border border-[#8b5cf6]/50 bg-[#020617] px-3 text-sm font-semibold text-white outline-none"
              onChange={(event) => onEditValueChange(event.target.value)}
              value={editValue}
            />
          ) : (
            <>
              <h3 className="text-base font-semibold text-white">
                {group?.name ?? "Ungrouped Positions"}
              </h3>
              <p className="mt-1 text-xs text-[#94a3b8]">
                {positions.length} position{positions.length === 1 ? "" : "s"}
              </p>
            </>
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

      <div className="mt-3 grid gap-2">
        {positions.length === 0 ? (
          <p className="rounded-md border border-dashed border-white/10 p-4 text-sm text-[#64748b]">
            No positions in this section.
          </p>
        ) : (
          positions.map((position) => {
            const isEditing = editingPositionId === position.id;

            return (
              <div
                className="rounded-md border border-white/10 bg-[#0b1020] p-3"
                key={position.id}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  {isEditing ? (
                    <input
                      autoFocus
                      className="h-9 min-w-0 flex-1 rounded-md border border-[#8b5cf6]/50 bg-[#020617] px-3 text-sm font-semibold text-white outline-none"
                      onChange={(event) => onEditValueChange(event.target.value)}
                      value={editValue}
                    />
                  ) : (
                    <span className="font-semibold text-[#f8fafc]">
                      {position.name}
                    </span>
                  )}

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
