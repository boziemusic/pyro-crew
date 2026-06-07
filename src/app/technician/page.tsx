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
  TEMPORARY_TECHNICIANS,
  type TemporaryTechnicianId,
  useTemporaryAdditionalTechnicianAssignments,
  useTemporaryTechnicianAssignments,
} from "@/components/temporary-technician-store";
import {
  acknowledgeResolutionNotice,
  useResolutionNoticeAcknowledgements,
} from "@/components/resolution-notice-store";
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
  status: string;
  created_at: string | null;
};

type StatusAction = {
  label: string;
  status: string;
  className: string;
};

type UnfixableHistoryNote = {
  issue_id: string;
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

export default function TechnicianConsolePage() {
  const activeShow = useActiveShow();
  const assignments = useTemporaryTechnicianAssignments();
  const additionalAssignments =
    useTemporaryAdditionalTechnicianAssignments();
  const resolutionAcknowledgements =
    useResolutionNoticeAcknowledgements();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [selectedTechnician, setSelectedTechnician] =
    useState<TemporaryTechnicianId>("tech_1");
  const [issues, setIssues] = useState<TechnicianIssue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingIssueId, setUpdatingIssueId] = useState<string | null>(null);
  const [noteIssueId, setNoteIssueId] = useState<string | null>(null);
  const [retrievingPartsNote, setRetrievingPartsNote] = useState("");
  const [historyWarning, setHistoryWarning] = useState<string | null>(null);
  const [unfixableNotes, setUnfixableNotes] = useState<
    Record<string, string>
  >({});
  const [historyReadWarning, setHistoryReadWarning] = useState<
    string | null
  >(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const fetchIssues = useCallback(async () => {
    if (!activeShow) {
      return { data: [], error: null };
    }

    return supabase
      .from("issues")
      .select(
        "id, channel_number, cue_value, issue_type, position_name, status, created_at",
      )
      .eq("show_id", activeShow.id)
      .order("created_at", { ascending: false });
  }, [activeShow, supabase]);

  const refreshUnfixableNotes = useCallback(
    async (issueRecords: TechnicianIssue[]) => {
      const unfixableIssueIds = issueRecords
        .filter((issue) => issue.status === "unfixable")
        .map((issue) => issue.id);

      if (unfixableIssueIds.length === 0) {
        setUnfixableNotes({});
        setHistoryReadWarning(null);
        return;
      }

      const { data, error } = await supabase
        .from("issue_status_history")
        .select("issue_id, note, created_at")
        .in("issue_id", unfixableIssueIds)
        .eq("new_status", "unfixable")
        .not("note", "is", null)
        .order("created_at", { ascending: false });

      if (error) {
        setUnfixableNotes({});
        setHistoryReadWarning(getHistoryReadFailureMessage(error.message));
        return;
      }

      const notes = ((data ?? []) as UnfixableHistoryNote[]).reduce<
        Record<string, string>
      >((latest, history) => {
        if (history.note && !latest[history.issue_id]) {
          latest[history.issue_id] = history.note;
        }

        return latest;
      }, {});

      setUnfixableNotes(notes);
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
    await refreshUnfixableNotes(nextIssues);
  }, [fetchIssues, refreshUnfixableNotes]);

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
        await refreshUnfixableNotes(nextIssues);
      }

      setIsLoading(false);
    };

    void loadIssues();
  }, [fetchIssues, refreshUnfixableNotes]);

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

  const activeIssues = useMemo(
    () =>
      assignedIssues.filter((issue) => activeStatuses.has(issue.status)),
    [assignedIssues],
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
      setRetrievingPartsNote("");
    }

    setUpdatingIssueId(null);
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

      <section className="rounded-lg border border-white/10 bg-[#0b1020]/90 p-6 shadow-xl shadow-black/20">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">
              Field response queue
            </h2>
            <p className="mt-2 text-sm text-[#94a3b8]">
              Assignments are temporary MVP data stored in this browser.
            </p>
          </div>
          <label className="grid min-w-52 gap-2 text-sm font-semibold text-[#dbe4ef]">
            Technician
            <select
              value={selectedTechnician}
              onChange={(event) => {
                setSelectedTechnician(
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
          ) : activeIssues.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/15 bg-[#070b18] p-6 text-center">
              <p className="font-semibold text-[#dbe4ef]">
                No active issues assigned to this technician.
              </p>
              <p className="mt-2 text-sm text-[#94a3b8]">
                Use an Issue Detail page to create a temporary assignment.
              </p>
            </div>
          ) : (
            activeIssues.map((issue) => {
              const isUpdating = updatingIssueId === issue.id;

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
                    {STATUS_ACTIONS.map((action) => (
                      <button
                        key={action.status}
                        type="button"
                        disabled={isUpdating}
                        onClick={() => {
                          if (action.status === "retrieving_parts") {
                            setNoteIssueId(issue.id);
                            setRetrievingPartsNote("");
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
                        Retrieving Parts Note
                        <textarea
                          className="min-h-20 resize-y rounded-md border border-white/15 bg-[#020617] p-3 text-sm text-white outline-none focus:border-[#f59e0b]"
                          onChange={(event) =>
                            setRetrievingPartsNote(event.target.value)
                          }
                          placeholder="Required: describe the parts being retrieved"
                          value={retrievingPartsNote}
                        />
                      </label>
                      <div className="mt-3 flex gap-2">
                        <button
                          className="rounded-md bg-[#b45309] px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={
                            !retrievingPartsNote.trim() || isUpdating
                          }
                          onClick={() =>
                            void updateIssueStatus(
                              issue,
                              "retrieving_parts",
                              retrievingPartsNote.trim(),
                            )
                          }
                          type="button"
                        >
                          Save Note & Update Status
                        </button>
                        <button
                          className="rounded-md border border-white/15 px-3 py-2 text-xs font-semibold text-[#cbd5e1]"
                          onClick={() => {
                            setNoteIssueId(null);
                            setRetrievingPartsNote("");
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
            })
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
                    {issue.status === "unfixable" ? (
                      <p className="mt-3 text-sm italic leading-6 text-[#cbd5e1]">
                        {unfixableNotes[issue.id] ??
                          "No unfixable note provided."}
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
