"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useActiveShow } from "@/components/active-show-strip";
import {
  formatIssueLabel,
  getIssueStatusClassName,
  IssueIdentifiers,
} from "@/components/issue-identifiers";
import {
  getTemporaryTechnicianLabel,
  TEMPORARY_TECHNICIANS,
  type TemporaryTechnicianId,
  setSelectedTemporaryTechnician,
  useTemporaryAdditionalTechnicianAssignmentTimes,
  useTemporaryAdditionalTechnicianAssignments,
  useSelectedTemporaryTechnician,
  useTemporaryTechnicianAssignmentTimes,
  useTemporaryTechnicianAssignments,
} from "@/components/temporary-technician-store";
import {
  acknowledgeResolutionNotice,
  useResolutionNoticeAcknowledgements,
} from "@/components/resolution-notice-store";
import {
  acceptTemporaryHandoff,
  acknowledgeTemporaryHandoff,
  TEMPORARY_HANDOFF_EVENT,
  useTemporaryHandoffs,
  type TemporaryHandoff,
} from "@/components/temporary-handoff-store";
import {
  getHistoryReadFailureMessage,
  getHistoryWriteFailureMessage,
} from "@/lib/issue-status-history";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type TechnicianIssue = {
  id: string;
  channel_number: number;
  cue_value: string;
  issue_type: string;
  position_name: string | null;
  effect_name: string | null;
  status: string;
  created_at: string | null;
  updated_at: string | null;
};

type StatusAction = {
  label: string;
  status: string;
  className: string;
};

type IssueHistoryNote = {
  issue_id: string;
  new_status: string;
  note: string | null;
  created_at: string | null;
};

const STATUS_ACTIONS: StatusAction[] = [
  {
    label: "Working",
    status: "in_progress",
    className: "border-[#3b82f6]/45 bg-[#0b1b35] text-[#bfdbfe]",
  },
  {
    label: "Retrieving Parts",
    status: "retrieving_parts",
    className: "border-[#f59e0b]/45 bg-[#2a1c06] text-[#fde68a]",
  },
  {
    label: "Need Director",
    status: "director_assistance_requested",
    className: "border-[#f59e0b]/45 bg-[#2a1c06] text-[#fde68a]",
  },
  {
    label: "Request Additional Tech",
    status: "additional_technician_requested",
    className: "border-[#f59e0b]/45 bg-[#2a1c06] text-[#fde68a]",
  },
  {
    label: "Ready For Verification",
    status: "awaiting_verification",
    className: "border-[#22c55e]/45 bg-[#082515] text-[#bbf7d0]",
  },
];

const activeStatuses = new Set([
  "new",
  "assigned",
  "in_progress",
  "retrieving_parts",
  "director_assistance_requested",
  "additional_technician_requested",
  "awaiting_verification",
  "verification_failed",
  "root_cause_required",
  "unfixable_recommended",
]);

const resolutionStatuses = new Set([
  "verified_resolved",
  "closed",
  "unfixable",
]);

function getTimestampValue(value: string | null | undefined) {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export default function TechnicianConsolePage() {
  const activeShow = useActiveShow();
  const assignments = useTemporaryTechnicianAssignments();
  const assignmentTimes = useTemporaryTechnicianAssignmentTimes();
  const additionalAssignments =
    useTemporaryAdditionalTechnicianAssignments();
  const additionalAssignmentTimes =
    useTemporaryAdditionalTechnicianAssignmentTimes();
  const resolutionAcknowledgements =
    useResolutionNoticeAcknowledgements();
  const handoffs = useTemporaryHandoffs();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const selectedTechnician = useSelectedTemporaryTechnician();
  const [issues, setIssues] = useState<TechnicianIssue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingIssueId, setUpdatingIssueId] = useState<string | null>(null);
  const [noteIssueId, setNoteIssueId] = useState<string | null>(null);
  const [noteStatus, setNoteStatus] = useState<
    "retrieving_parts" | "director_assistance_requested" | null
  >(null);
  const [requiredNote, setRequiredNote] = useState("");
  const [noteValidation, setNoteValidation] = useState<string | null>(null);
  const [historyWarning, setHistoryWarning] = useState<string | null>(null);
  const [latestIssueNotes, setLatestIssueNotes] = useState<
    Record<string, string>
  >({});
  const [latestNotFixedNotes, setLatestNotFixedNotes] = useState<
    Record<string, string>
  >({});
  const [latestStatusUpdateTimes, setLatestStatusUpdateTimes] = useState<
    Record<string, string>
  >({});
  const [historyReadWarning, setHistoryReadWarning] = useState<
    string | null
  >(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [handoffNotes, setHandoffNotes] = useState<Record<string, string>>(
    {},
  );

  const fetchIssues = useCallback(async () => {
    if (!activeShow) {
      return { data: [], error: null };
    }

    return supabase
      .from("issues")
      .select(
        "id, channel_number, cue_value, issue_type, position_name, effect_name, status, created_at, updated_at",
      )
      .eq("show_id", activeShow.id)
      .order("created_at", { ascending: false });
  }, [activeShow, supabase]);

  const refreshLatestNotes = useCallback(
    async (issueRecords: TechnicianIssue[]) => {
      const issueIds = issueRecords.map((issue) => issue.id);

      if (issueIds.length === 0) {
        setLatestIssueNotes({});
        setLatestNotFixedNotes({});
        setLatestStatusUpdateTimes({});
        setHistoryReadWarning(null);
        return;
      }

      const { data, error } = await supabase
        .from("issue_status_history")
        .select("issue_id, new_status, note, created_at")
        .in("issue_id", issueIds)
        .order("created_at", { ascending: false });

      if (error) {
        setLatestIssueNotes({});
        setLatestNotFixedNotes({});
        setLatestStatusUpdateTimes({});
        setHistoryReadWarning(getHistoryReadFailureMessage(error.message));
        return;
      }

      const notes: Record<string, string> = {};
      const notFixedNotes: Record<string, string> = {};
      const statusUpdateTimes: Record<string, string> = {};
      const latestEventsSeen = new Set<string>();

      for (const history of (data ?? []) as IssueHistoryNote[]) {
        if (!latestEventsSeen.has(history.issue_id)) {
          latestEventsSeen.add(history.issue_id);

          if (
            history.note?.trim() &&
            (history.new_status === "verification_failed" ||
              history.note.startsWith("Not Fixed"))
          ) {
            notFixedNotes[history.issue_id] = "Not Fixed";
          }
        }

        if (
          history.note?.trim() &&
          !notes[history.issue_id]
        ) {
          notes[history.issue_id] = history.note;
        }

        if (
          history.created_at &&
          !statusUpdateTimes[history.issue_id]
        ) {
          statusUpdateTimes[history.issue_id] = history.created_at;
        }
      }

      setLatestIssueNotes(notes);
      setLatestNotFixedNotes(notFixedNotes);
      setLatestStatusUpdateTimes(statusUpdateTimes);
      setHistoryReadWarning(null);
    },
    [supabase],
  );

  const refreshIssues = useCallback(async () => {
    const { data, error } = await fetchIssues();

    if (error) {
      setFeedback({
        type: "error",
        message: `Could not load technician issues: ${error.message}`,
      });
      return;
    }

    const nextIssues = (data ?? []) as TechnicianIssue[];
    setIssues(nextIssues);
    await refreshLatestNotes(nextIssues);
  }, [fetchIssues, refreshLatestNotes]);

  useEffect(() => {
    const loadIssues = async () => {
      const { data, error } = await fetchIssues();

      if (error) {
        setFeedback({
          type: "error",
          message: `Could not load technician issues: ${error.message}`,
        });
      } else {
        const nextIssues = (data ?? []) as TechnicianIssue[];
        setIssues(nextIssues);
        await refreshLatestNotes(nextIssues);
      }

      setIsLoading(false);
    };

    void loadIssues();
  }, [fetchIssues, refreshLatestNotes]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshIssues();
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [refreshIssues]);

  useEffect(() => {
    const handleHandoffChange = () => {
      void refreshIssues();
    };

    window.addEventListener(TEMPORARY_HANDOFF_EVENT, handleHandoffChange);

    return () =>
      window.removeEventListener(
        TEMPORARY_HANDOFF_EVENT,
        handleHandoffChange,
      );
  }, [refreshIssues]);

  const assignedIssues = useMemo(
    () =>
      issues.filter(
        (issue) =>
          assignments[issue.id] === selectedTechnician ||
          additionalAssignments[issue.id] === selectedTechnician,
      ),
    [
      additionalAssignments,
      assignments,
      issues,
      selectedTechnician,
    ],
  );

  const workingIssues = useMemo(
    () =>
      assignedIssues
        .filter((issue) => issue.status === "in_progress")
        .sort((a, b) => {
          const aTime =
            latestStatusUpdateTimes[a.id] ??
            a.updated_at ??
            a.created_at ??
            "";
          const bTime =
            latestStatusUpdateTimes[b.id] ??
            b.updated_at ??
            b.created_at ??
            "";

          return getTimestampValue(bTime) - getTimestampValue(aTime);
        }),
    [assignedIssues, latestStatusUpdateTimes],
  );

  const fieldResponseIssues = useMemo(
    () =>
      assignedIssues
        .filter(
          (issue) =>
            activeStatuses.has(issue.status) &&
            issue.status !== "in_progress",
        )
        .sort((a, b) => {
          const aIsQueued = a.status === "assigned";
          const bIsQueued = b.status === "assigned";

          if (aIsQueued !== bIsQueued) {
            return aIsQueued ? -1 : 1;
          }

          const aAssignmentTime =
            assignments[a.id] === selectedTechnician
              ? assignmentTimes[a.id]
              : additionalAssignmentTimes[a.id];
          const bAssignmentTime =
            assignments[b.id] === selectedTechnician
              ? assignmentTimes[b.id]
              : additionalAssignmentTimes[b.id];
          const aTime =
            (aIsQueued ? aAssignmentTime : latestStatusUpdateTimes[a.id]) ??
            a.updated_at ??
            a.created_at ??
            "";
          const bTime =
            (bIsQueued ? bAssignmentTime : latestStatusUpdateTimes[b.id]) ??
            b.updated_at ??
            b.created_at ??
            "";

          return getTimestampValue(aTime) - getTimestampValue(bTime);
        }),
    [
      additionalAssignmentTimes,
      assignedIssues,
      assignmentTimes,
      assignments,
      latestStatusUpdateTimes,
      selectedTechnician,
    ],
  );

  const resolutionNotices = useMemo(() => {
    const acknowledgedIssueIds = new Set(
      resolutionAcknowledgements[selectedTechnician],
    );

    return assignedIssues.filter(
      (issue) =>
        resolutionStatuses.has(issue.status) &&
        !acknowledgedIssueIds.has(issue.id),
    );
  }, [
    assignedIssues,
    resolutionAcknowledgements,
    selectedTechnician,
  ]);

  const outgoingHandoffNotices = useMemo(
    () =>
      handoffs.filter(
        (handoff) =>
          handoff.fromTechnician === selectedTechnician &&
          !handoff.outgoingAcknowledged,
      ),
    [handoffs, selectedTechnician],
  );

  const incomingHandoffNotices = useMemo(
    () =>
      handoffs.filter(
        (handoff) =>
          handoff.toTechnician === selectedTechnician &&
          !handoff.incomingAccepted,
      ),
    [handoffs, selectedTechnician],
  );

  const updateIssueStatus = async (
    issue: TechnicianIssue,
    status: string,
    note: string | null = null,
  ) => {
    if (!activeShow) {
      return;
    }

    setUpdatingIssueId(issue.id);
    setFeedback(null);
    setHistoryWarning(null);

    const { error } = await supabase
      .from("issues")
      .update({ status })
      .eq("id", issue.id)
      .eq("show_id", activeShow.id);

    if (error) {
      setFeedback({
        type: "error",
        message: `Status update failed: ${error.message}`,
      });
    } else {
      const statusChangedAt = new Date().toISOString();
      setIssues((currentIssues) =>
        currentIssues.map((currentIssue) =>
          currentIssue.id === issue.id
            ? {
                ...currentIssue,
                status,
                updated_at: statusChangedAt,
              }
            : currentIssue,
        ),
      );
      setLatestStatusUpdateTimes((currentTimes) => ({
        ...currentTimes,
        [issue.id]: statusChangedAt,
      }));

      const { error: historyError } = await supabase
        .from("issue_status_history")
        .insert({
          changed_by_user_id: null,
          issue_id: issue.id,
          new_status: status,
          note,
          old_status: issue.status,
        });

      await refreshIssues();
      setFeedback({
        type: "success",
        message: `Issue status updated to ${formatIssueLabel(status)}.`,
      });
      setHistoryWarning(
        historyError
          ? getHistoryWriteFailureMessage(historyError.message)
          : null,
      );
      setNoteIssueId(null);
      setNoteStatus(null);
      setRequiredNote("");
      setNoteValidation(null);
    }

    setUpdatingIssueId(null);
  };

  const acknowledgeHandoff = async (handoff: TemporaryHandoff) => {
    const note = handoffNotes[handoff.id]?.trim() ?? "";
    acknowledgeTemporaryHandoff(handoff.id, note || null);
    setHandoffNotes((currentNotes) => {
      const nextNotes = { ...currentNotes };
      delete nextNotes[handoff.id];
      return nextNotes;
    });
    setFeedback({
      type: "success",
      message: "Handoff acknowledged.",
    });

    const originalTech = TEMPORARY_TECHNICIANS.find(
      (technician) => technician.id === handoff.fromTechnician,
    )?.label;
    const newTech = TEMPORARY_TECHNICIANS.find(
      (technician) => technician.id === handoff.toTechnician,
    )?.label;
    const historyNote = `${originalTech} acknowledged handoff to ${newTech}.${
      note ? ` Handoff note: ${note}` : ""
    }`;
    const { error } = await supabase.from("issue_status_history").insert({
      changed_by_user_id: null,
      issue_id: handoff.issueId,
      new_status: "assigned",
      note: historyNote,
      old_status: handoff.previousStatus,
    });

    setHistoryWarning(
      error ? getHistoryWriteFailureMessage(error.message) : null,
    );
  };

  const acceptHandoff = async (handoff: TemporaryHandoff) => {
    acceptTemporaryHandoff(handoff.id);
    setFeedback({
      type: "success",
      message: "Handoff accepted.",
    });

    const originalTech = TEMPORARY_TECHNICIANS.find(
      (technician) => technician.id === handoff.fromTechnician,
    )?.label;
    const receivingTech = TEMPORARY_TECHNICIANS.find(
      (technician) => technician.id === handoff.toTechnician,
    )?.label;
    const { error } = await supabase.from("issue_status_history").insert({
      changed_by_user_id: null,
      issue_id: handoff.issueId,
      new_status: "assigned",
      note: `${receivingTech} accepted handoff from ${originalTech}.`,
      old_status: handoff.previousStatus,
    });

    setHistoryWarning(
      error ? getHistoryWriteFailureMessage(error.message) : null,
    );
  };

  const renderIssueCard = (issue: TechnicianIssue) => {
    const isUpdating = updatingIssueId === issue.id;
    const notFixedNote = latestNotFixedNotes[issue.id];

    return (
      <article
        key={issue.id}
        className="rounded-lg border border-white/10 bg-[#070b18] p-5"
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="grid gap-2">
            <p className="text-base text-[#dbe4ef]">
              <IssueIdentifiers
                channelNumber={issue.channel_number}
                cueValue={issue.cue_value}
                issueType={issue.issue_type}
              />
            </p>
            <p className="text-sm text-[#94a3b8]">
              Position: {issue.position_name ?? "None"}
            </p>
            {issue.effect_name ? (
              <p className="text-sm text-[#94a3b8]">
                Effect: {issue.effect_name}
              </p>
            ) : null}
            {notFixedNote ? (
              <div className="rounded-md border border-[#ef4444]/45 bg-[#2a0b13] px-3 py-2">
                <p className="text-sm font-bold text-[#fecaca]">
                  Director marked Not Fixed
                </p>
                <p className="mt-1 text-sm italic leading-6 text-[#f8d0d0]">
                  {notFixedNote}
                </p>
              </div>
            ) : latestIssueNotes[issue.id] ? (
              <p className="text-sm italic leading-6 text-[#cbd5e1]">
                Note: {latestIssueNotes[issue.id]}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`rounded-lg border px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${getIssueStatusClassName(issue.status)}`}
            >
              {formatIssueLabel(issue.status)}
            </span>
            <Link
              href={`/issues/${issue.id}`}
              className="text-sm font-semibold text-[#c4b5fd] hover:text-white"
            >
              View Issue
            </Link>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-4">
          {STATUS_ACTIONS.filter((action) => {
            if (issue.status === "in_progress") {
              return action.status !== "in_progress";
            }

            return action.status === "in_progress";
          }).map((action) => (
            <button
              key={action.status}
              type="button"
              disabled={isUpdating}
              onClick={() => {
                if (
                  action.status === "retrieving_parts" ||
                  action.status === "director_assistance_requested"
                ) {
                  setNoteIssueId(issue.id);
                  setNoteStatus(action.status);
                  setRequiredNote("");
                  setNoteValidation(null);
                  setFeedback(null);
                  setHistoryWarning(null);
                  return;
                }

                void updateIssueStatus(issue, action.status);
              }}
              className={`rounded-md border px-3 py-2 text-xs font-semibold transition hover:brightness-125 disabled:cursor-wait disabled:opacity-50 ${action.className}`}
            >
              {isUpdating ? "Updating..." : action.label}
            </button>
          ))}
        </div>
        {noteIssueId === issue.id ? (
          <div className="mt-3 rounded-lg border border-[#f59e0b]/35 bg-[#2a1c06]/70 p-4">
            <label className="grid gap-2 text-sm font-semibold text-[#fde68a]">
              {noteStatus === "director_assistance_requested"
                ? "Director Assistance Note"
                : "Retrieving Parts Note"}
              <textarea
                className="min-h-20 resize-y rounded-md border border-white/15 bg-[#020617] p-3 text-sm text-white outline-none focus:border-[#f59e0b]"
                onChange={(event) => {
                  setRequiredNote(event.target.value);
                  setNoteValidation(null);
                }}
                placeholder={
                  noteStatus === "director_assistance_requested"
                    ? "Required: explain what help is needed"
                    : "Required: describe the parts being retrieved"
                }
                value={requiredNote}
              />
            </label>
            {noteValidation ? (
              <p className="mt-2 text-sm font-semibold text-[#fecaca]">
                {noteValidation}
              </p>
            ) : null}
            <div className="mt-3 flex gap-2">
              <button
                className="rounded-md bg-[#b45309] px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isUpdating}
                onClick={() => {
                  if (!requiredNote.trim()) {
                    setNoteValidation(
                      "A short note is required before changing this status.",
                    );
                    return;
                  }

                  if (noteStatus) {
                    void updateIssueStatus(
                      issue,
                      noteStatus,
                      requiredNote.trim(),
                    );
                  }
                }}
                type="button"
              >
                Submit Note & Update Status
              </button>
              <button
                className="rounded-md border border-white/15 px-3 py-2 text-xs font-semibold text-[#cbd5e1]"
                onClick={() => {
                  setNoteIssueId(null);
                  setNoteStatus(null);
                  setRequiredNote("");
                  setNoteValidation(null);
                }}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </article>
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 sm:px-8 lg:py-8">
      <section className="rounded-lg border border-white/10 bg-[#0b1020]/90 p-6 shadow-2xl shadow-black/25">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#a78bfa]">
          Technician Console
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-normal text-white sm:text-4xl">
          Assigned continuity issue workbench
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-[#b6c3d1]">
          Select a temporary technician identity to view assigned field work
          and report operational status to the Director.
        </p>
      </section>

      {outgoingHandoffNotices.length > 0 ||
      incomingHandoffNotices.length > 0 ? (
        <section className="rounded-lg border border-[#8b5cf6]/30 bg-[#130a2b]/80 p-5 shadow-xl shadow-black/20">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Handoff Notices
              </h2>
              <p className="mt-1 text-xs text-[#c4b5fd]">
                Reassigned issue context requiring acknowledgement.
              </p>
            </div>
            <span className="rounded-md border border-white/10 bg-[#070b18] px-2 py-1 text-xs font-bold text-[#cbd5e1]">
              {outgoingHandoffNotices.length +
                incomingHandoffNotices.length}
            </span>
          </div>

          <div className="mt-4 grid gap-3">
            {outgoingHandoffNotices.map((handoff) => (
              <article
                className="rounded-lg border border-[#f59e0b]/35 bg-[#2a1c06]/70 p-4"
                key={handoff.id}
              >
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#fde68a]">
                  Issue Reassigned
                </p>
                <p className="mt-2 text-sm text-[#dbe4ef]">
                  This issue was reassigned to{" "}
                  {getTemporaryTechnicianLabel(handoff.toTechnician)}.
                </p>
                <p className="mt-3 text-sm text-[#dbe4ef]">
                  <IssueIdentifiers
                    channelNumber={handoff.channelNumber}
                    cueValue={handoff.cueValue}
                    issueType={handoff.issueType}
                  />
                </p>
                <p className="mt-2 text-sm text-[#cbd5e1]">
                  Current Status:{" "}
                  <strong>{formatIssueLabel(handoff.previousStatus)}</strong>
                </p>
                <p className="mt-1 text-sm text-[#cbd5e1]">
                  Please acknowledge handoff.
                </p>
                <label className="mt-3 grid gap-2 text-sm font-semibold text-[#fde68a]">
                  Optional Handoff Note
                  <textarea
                    className="min-h-20 resize-y rounded-md border border-white/15 bg-[#020617] p-3 text-sm text-white outline-none focus:border-[#f59e0b]"
                    onChange={(event) =>
                      setHandoffNotes((currentNotes) => ({
                        ...currentNotes,
                        [handoff.id]: event.target.value,
                      }))
                    }
                    value={handoffNotes[handoff.id] ?? ""}
                  />
                </label>
                <button
                  className="mt-3 rounded-md border border-[#f59e0b]/45 bg-[#3a2507] px-3 py-2 text-xs font-bold text-[#fde68a]"
                  onClick={() => void acknowledgeHandoff(handoff)}
                  type="button"
                >
                  Acknowledge Handoff
                </button>
              </article>
            ))}

            {incomingHandoffNotices.map((handoff) => (
              <article
                className="rounded-lg border border-[#3b82f6]/35 bg-[#0b1b35]/75 p-4"
                key={handoff.id}
              >
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#bfdbfe]">
                  Issue Reassigned
                </p>
                <p className="mt-2 text-sm text-[#dbe4ef]">
                  This issue was reassigned from{" "}
                  {getTemporaryTechnicianLabel(handoff.fromTechnician)}.
                </p>
                <p className="mt-3 text-sm text-[#dbe4ef]">
                  <IssueIdentifiers
                    channelNumber={handoff.channelNumber}
                    cueValue={handoff.cueValue}
                    issueType={handoff.issueType}
                  />
                </p>
                <dl className="mt-3 grid gap-2 text-sm text-[#cbd5e1] sm:grid-cols-2">
                  <div>
                    <dt className="text-xs uppercase text-[#64748b]">
                      Position
                    </dt>
                    <dd>{handoff.positionName ?? "None"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-[#64748b]">
                      Effect
                    </dt>
                    <dd>{handoff.effectName ?? "None"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-[#64748b]">
                      Current Status
                    </dt>
                    <dd>{formatIssueLabel(handoff.previousStatus)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-[#64748b]">
                      Handoff Note
                    </dt>
                    <dd>
                      {handoff.handoffNote ??
                        "No handoff note provided yet."}
                    </dd>
                  </div>
                </dl>
                <button
                  className="mt-3 rounded-md border border-[#3b82f6]/45 bg-[#0b2a4d] px-3 py-2 text-xs font-bold text-[#bfdbfe]"
                  onClick={() => void acceptHandoff(handoff)}
                  type="button"
                >
                  Accept Handoff
                </button>
              </article>
            ))}
          </div>
          {historyWarning ? (
            <p className="mt-3 rounded-md border border-[#f59e0b]/35 bg-[#2a1c06] p-3 text-xs font-semibold leading-5 text-[#fde68a]">
              {historyWarning}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-lg border border-[#3b82f6]/25 bg-[#0b1020]/90 p-6 shadow-xl shadow-black/20">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">
              Working
            </h2>
            <p className="mt-2 text-sm text-[#94a3b8]">
              Issues currently being worked by the selected technician.
            </p>
          </div>
          <label className="grid min-w-52 gap-2 text-sm font-semibold text-[#dbe4ef]">
            Technician
            <select
              value={selectedTechnician}
              onChange={(event) => {
                setSelectedTemporaryTechnician(
                  event.target.value as TemporaryTechnicianId,
                );
                setFeedback(null);
              }}
              className="h-11 rounded-md border border-white/15 bg-[#070b18] px-3 text-base text-white outline-none transition focus:border-[#a78bfa] focus:ring-2 focus:ring-[#4c00a4]/40"
            >
              {TEMPORARY_TECHNICIANS.map((technician) => (
                <option key={technician.id} value={technician.id}>
                  {technician.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {feedback ? (
          <p
            className={`mt-5 rounded-lg border p-3 text-sm font-semibold ${
              feedback.type === "success"
                ? "border-[#22c55e]/40 bg-[#082515] text-[#bbf7d0]"
                : "border-[#ef4444]/40 bg-[#2a0b13] text-[#fecaca]"
            }`}
          >
            {feedback.message}
          </p>
        ) : null}
        {historyWarning ? (
          <p className="mt-3 rounded-lg border border-[#f59e0b]/45 bg-[#2a1c06] p-3 text-sm font-semibold leading-6 text-[#fde68a]">
            {historyWarning}
          </p>
        ) : null}

        <div className="mt-5 grid gap-4">
          {isLoading ? (
            <p className="text-sm text-[#94a3b8]">Loading assigned issues...</p>
          ) : workingIssues.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/15 bg-[#070b18] p-6 text-center">
              <p className="font-semibold text-[#dbe4ef]">
                No issues currently being worked.
              </p>
              <p className="mt-2 text-sm text-[#94a3b8]">
                Start an In Queue issue when field work begins.
              </p>
            </div>
          ) : (
            workingIssues.map(renderIssueCard)
          )}
        </div>
      </section>

      <section className="rounded-lg border border-white/10 bg-[#0b1020]/90 p-6 shadow-xl shadow-black/20">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-white">
              Field Response Queue
            </h2>
            <p className="mt-2 text-sm text-[#94a3b8]">
              Waiting assignments and field responses, ordered for the
              technician&apos;s next action.
            </p>
          </div>
          <span className="rounded-md border border-white/10 bg-[#070b18] px-2 py-1 text-xs font-bold text-[#cbd5e1]">
            {fieldResponseIssues.length}
          </span>
        </div>

        <div className="mt-5 grid gap-4">
          {isLoading ? (
            <p className="text-sm text-[#94a3b8]">
              Loading field response queue...
            </p>
          ) : fieldResponseIssues.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/15 bg-[#070b18] p-6 text-center">
              <p className="font-semibold text-[#dbe4ef]">
                No issues waiting in the field response queue.
              </p>
              <p className="mt-2 text-sm text-[#94a3b8]">
                New assignments will appear here until work begins.
              </p>
            </div>
          ) : (
            fieldResponseIssues.map(renderIssueCard)
          )}
        </div>
      </section>

      <section className="rounded-lg border border-white/10 bg-[#0b1020]/90 p-5 shadow-xl shadow-black/20">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Resolution Notices
            </h2>
            <p className="mt-1 text-xs text-[#94a3b8]">
              Completed issue outcomes awaiting acknowledgement.
            </p>
          </div>
          <span className="rounded-md border border-white/10 bg-[#070b18] px-2 py-1 text-xs font-bold text-[#cbd5e1]">
            {resolutionNotices.length}
          </span>
        </div>

        <div className="mt-4 grid gap-3">
          {historyReadWarning ? (
            <p className="rounded-lg border border-[#f59e0b]/45 bg-[#2a1c06] p-3 text-xs font-semibold leading-5 text-[#fde68a]">
              {historyReadWarning}
            </p>
          ) : null}
          {resolutionNotices.length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/15 bg-[#070b18] p-4 text-sm text-[#94a3b8]">
              No resolution notices.
            </p>
          ) : (
            resolutionNotices.map((issue) => (
              <article
                className="rounded-lg border border-white/10 bg-[#070b18] p-4"
                key={issue.id}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm text-[#dbe4ef]">
                      <IssueIdentifiers
                        channelNumber={issue.channel_number}
                        cueValue={issue.cue_value}
                        issueType={issue.issue_type}
                      />
                    </p>
                    <span
                      className={`mt-2 inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${getIssueStatusClassName(issue.status)}`}
                    >
                      {formatIssueLabel(issue.status)}
                    </span>
                    {latestIssueNotes[issue.id] ? (
                      <p className="mt-3 text-sm italic leading-6 text-[#cbd5e1]">
                        Note: {latestIssueNotes[issue.id]}
                      </p>
                    ) : issue.status === "unfixable" ? (
                      <p className="mt-3 text-sm italic leading-6 text-[#cbd5e1]">
                        Note: No unfixable note provided.
                      </p>
                    ) : null}
                  </div>
                  <button
                    className="rounded-md border border-[#8b5cf6]/45 bg-[#1b1235] px-3 py-2 text-xs font-semibold text-[#d8c8ff] transition hover:border-[#a78bfa]"
                    onClick={() =>
                      acknowledgeResolutionNotice(
                        selectedTechnician,
                        issue.id,
                      )
                    }
                    type="button"
                  >
                    Acknowledge & Remove
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
