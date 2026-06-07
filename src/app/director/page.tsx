"use client";

import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { useActiveShow } from "@/components/active-show-strip";
import {
  formatIssueLabel,
  getIssueStatusClassName,
  IssueIdentifiers,
} from "@/components/issue-identifiers";
import { DirectorAttentionQueue } from "@/components/director-attention-queue";
import {
  getContinuitySessionPolicyMessage,
  setActiveContinuitySession,
  useActiveContinuitySession,
} from "@/components/active-continuity-session";
import {
  getTemporaryTechnicianLabel,
  setSelectedTemporaryTechnician,
  setTemporaryTechnicianAssignment,
  TEMPORARY_TECHNICIANS,
  type TemporaryTechnicianId,
  useTemporaryAdditionalTechnicianAssignments,
  useTemporaryAdditionalTechnicianAssignmentTimes,
  useTemporaryTechnicianAssignmentTimes,
  useTemporaryTechnicianAssignments,
} from "@/components/temporary-technician-store";
import {
  getHistoryReadFailureMessage,
  getHistoryWriteFailureMessage,
} from "@/lib/issue-status-history";
import { createSupabaseBrowserClient } from "@/lib/supabase";

const fieldClassName =
  "rounded-lg border border-[#334155] bg-[#020617] px-3 py-3 text-base font-semibold text-white placeholder:text-[#94a3b8] focus:border-[#8b5cf6] focus:outline-none focus:ring-2 focus:ring-[#4c00a4]/60";

type IssueType =
  | "no_continuity"
  | "unexpected_continuity"
  | "module_offline";

type IssueRecord = {
  id: string;
  channel_number: number;
  cue_value: string;
  issue_type: string;
  status: string;
  position_name: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type IssueHistoryNote = {
  issue_id: string;
  new_status: string;
  note: string | null;
  created_at: string | null;
};

type SessionSummaryHistory = {
  issue_id: string;
  new_status: string;
  created_at: string | null;
};

type TechnicianPerformance = {
  technicianId: TemporaryTechnicianId;
  technicianName: string;
  totalAssigned: number;
  resolved: number;
  unfixable: number;
  averageCompletionMs: number | null;
};

type EndSessionSummary = {
  proposedEndAt: string;
  totalTechnicians: number;
  totalIssues: number;
  resolvedIssues: number;
  unfixableIssues: number;
  openIssues: number;
  issuesRequiringParts: number;
  directorAssistanceRequests: number;
  additionalTechnicianRequests: number;
  averageAssignmentMs: number | null;
  averageDirectorResponseMs: number | null;
  technicianPerformance: TechnicianPerformance[];
};

type CreatedIssueFeedback = {
  channelNumber: number;
  cueValue: string;
  issueType: IssueType;
};

const statusOrder = [
  "new",
  "assigned",
  "in_progress",
  "retrieving_parts",
  "director_assistance_requested",
  "additional_technician_requested",
  "awaiting_verification",
  "verification_failed",
  "verified_resolved",
  "root_cause_required",
  "unfixable_recommended",
  "unfixable",
  "closed",
];

function formatActivityTime(createdAt: string | null) {
  if (!createdAt) {
    return "Time unavailable";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(createdAt));
}

const terminalStatuses = new Set([
  "verified_resolved",
  "closed",
  "unfixable",
]);

const attentionStatuses = new Set([
  "awaiting_verification",
  "director_assistance_requested",
  "additional_technician_requested",
]);

const resolvedStatuses = new Set(["verified_resolved", "closed"]);

function getTimestampValue(value: string | null | undefined) {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Unavailable";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

function formatDuration(durationMs: number | null) {
  if (durationMs === null) {
    return "Unavailable";
  }

  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function getAverageDuration(durations: number[]) {
  if (durations.length === 0) {
    return null;
  }

  return (
    durations.reduce((total, duration) => total + duration, 0) /
    durations.length
  );
}

function formatElapsedTime(startedAt: string | null, now: number | null) {
  if (!startedAt || now === null) {
    return "Starting...";
  }

  const elapsedSeconds = Math.max(
    0,
    Math.floor((now - new Date(startedAt).getTime()) / 1000),
  );
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

export default function DirectorConsolePage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const activeShow = useActiveShow();
  const activeSession = useActiveContinuitySession();
  const sessionForActiveShow =
    activeSession?.show_id === activeShow?.id ? activeSession : null;
  const technicianAssignments = useTemporaryTechnicianAssignments();
  const technicianAssignmentTimes =
    useTemporaryTechnicianAssignmentTimes();
  const additionalAssignments =
    useTemporaryAdditionalTechnicianAssignments();
  const additionalAssignmentTimes =
    useTemporaryAdditionalTechnicianAssignmentTimes();
  const isScripted = activeShow?.show_mode === "scripted";
  const isManual = activeShow?.show_mode === "manual";
  const [channelNumber, setChannelNumber] = useState("");
  const [cueValue, setCueValue] = useState("");
  const [positionName, setPositionName] = useState("");
  const [issueType, setIssueType] = useState<IssueType | "">("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdIssue, setCreatedIssue] =
    useState<CreatedIssueFeedback | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [issues, setIssues] = useState<IssueRecord[]>([]);
  const [isLoadingIssues, setIsLoadingIssues] = useState(true);
  const [issueLoadError, setIssueLoadError] = useState<string | null>(null);
  const [latestIssueNotes, setLatestIssueNotes] = useState<
    Record<string, string>
  >({});
  const [currentStatusEnteredAt, setCurrentStatusEnteredAt] = useState<
    Record<string, string>
  >({});
  const [expandedStatuses, setExpandedStatuses] = useState<Set<string>>(
    new Set(),
  );
  const [assigningIssueId, setAssigningIssueId] = useState<string | null>(
    null,
  );
  const [assignmentFeedback, setAssignmentFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [assignmentWarning, setAssignmentWarning] = useState<string | null>(
    null,
  );
  const [timerNow, setTimerNow] = useState<number | null>(null);
  const [endSessionStep, setEndSessionStep] = useState<
    "confirm" | "summary" | null
  >(null);
  const [isEndingSession, setIsEndingSession] = useState(false);
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);
  const [endSessionSummary, setEndSessionSummary] =
    useState<EndSessionSummary | null>(null);
  const [isLoadingSessionSummary, setIsLoadingSessionSummary] =
    useState(false);
  const [sessionSummaryError, setSessionSummaryError] = useState<
    string | null
  >(null);
  const [sessionSummaryWarning, setSessionSummaryWarning] = useState<
    string | null
  >(null);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setTimerNow(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  const fetchIssues = useCallback(async () => {
    if (!activeShow) {
      return { data: [], error: null };
    }

    return supabase
      .from("issues")
      .select(
        "id, channel_number, cue_value, issue_type, status, position_name, created_at, updated_at",
      )
      .eq("show_id", activeShow.id)
      .order("created_at", { ascending: false });
  }, [activeShow, supabase]);

  const refreshLatestNotes = useCallback(
    async (issueRecords: IssueRecord[]) => {
      if (issueRecords.length === 0) {
        setLatestIssueNotes({});
        setCurrentStatusEnteredAt({});
        return;
      }

      const { data, error } = await supabase
        .from("issue_status_history")
        .select("issue_id, new_status, note, created_at")
        .in(
          "issue_id",
          issueRecords.map((issue) => issue.id),
        )
        .order("created_at", { ascending: false });

      if (error) {
        setIssueLoadError(getHistoryReadFailureMessage(error.message));
        return;
      }

      const issueStatuses = new Map(
        issueRecords.map((issue) => [issue.id, issue.status]),
      );
      const notes: Record<string, string> = {};
      const statusEnteredAt: Record<string, string> = {};

      for (const history of (data ?? []) as IssueHistoryNote[]) {
        if (history.note?.trim() && !notes[history.issue_id]) {
          notes[history.issue_id] = history.note;
        }

        if (
          history.created_at &&
          history.new_status === issueStatuses.get(history.issue_id) &&
          !statusEnteredAt[history.issue_id]
        ) {
          statusEnteredAt[history.issue_id] = history.created_at;
        }
      }

      setLatestIssueNotes(notes);
      setCurrentStatusEnteredAt(statusEnteredAt);
    },
    [supabase],
  );

  const refreshIssues = useCallback(async () => {
    setIssueLoadError(null);
    const { data, error } = await fetchIssues();

    if (error) {
      setIssueLoadError(`Could not refresh issue data: ${error.message}`);
      return;
    }

    const nextIssues = (data ?? []) as IssueRecord[];
    setIssues(nextIssues);
    await refreshLatestNotes(nextIssues);
  }, [fetchIssues, refreshLatestNotes]);

  useEffect(() => {
    const loadInitialIssues = async () => {
      const { data, error } = await fetchIssues();

      if (error) {
        setIssues([]);
        setIssueLoadError(`Could not load issue data: ${error.message}`);
      } else {
        setIssueLoadError(null);
        const nextIssues = (data ?? []) as IssueRecord[];
        setIssues(nextIssues);
        await refreshLatestNotes(nextIssues);
      }

      setIsLoadingIssues(false);
    };

    void loadInitialIssues();
  }, [fetchIssues, refreshLatestNotes]);

  const statusGroups = useMemo(() => {
    const groups = new Map<string, IssueRecord[]>();

    issues.forEach((issue) => {
      groups.set(issue.status, [...(groups.get(issue.status) ?? []), issue]);
    });

    return statusOrder
      .map((status) => {
        const statusIssues = [...(groups.get(status) ?? [])].sort(
          (left, right) => {
            if (status === "new") {
              return (
                getTimestampValue(left.created_at) -
                getTimestampValue(right.created_at)
              );
            }

            if (status === "assigned") {
              const leftTime =
                technicianAssignmentTimes[left.id] ??
                left.updated_at ??
                left.created_at;
              const rightTime =
                technicianAssignmentTimes[right.id] ??
                right.updated_at ??
                right.created_at;

              return (
                getTimestampValue(leftTime) -
                getTimestampValue(rightTime)
              );
            }

            if (status === "in_progress") {
              const leftTime =
                currentStatusEnteredAt[left.id] ??
                left.updated_at ??
                left.created_at;
              const rightTime =
                currentStatusEnteredAt[right.id] ??
                right.updated_at ??
                right.created_at;

              return (
                getTimestampValue(rightTime) -
                getTimestampValue(leftTime)
              );
            }

            if (attentionStatuses.has(status)) {
              const leftTime =
                currentStatusEnteredAt[left.id] ??
                left.updated_at ??
                left.created_at;
              const rightTime =
                currentStatusEnteredAt[right.id] ??
                right.updated_at ??
                right.created_at;

              return (
                getTimestampValue(leftTime) -
                getTimestampValue(rightTime)
              );
            }

            return 0;
          },
        );

        return { issues: statusIssues, status };
      })
      .filter(({ issues: statusIssues }) => statusIssues.length > 0);
  }, [
    currentStatusEnteredAt,
    issues,
    technicianAssignmentTimes,
  ]);

  const latestIssue = issues[0] ?? null;

  const technicianOverview = useMemo(
    () =>
      TEMPORARY_TECHNICIANS.map((technician) => {
        const activeIssues = issues
          .filter(
            (issue) =>
              !terminalStatuses.has(issue.status) &&
              (technicianAssignments[issue.id] === technician.id ||
                additionalAssignments[issue.id] === technician.id),
          )
          .map((issue) => {
            const isPrimary =
              technicianAssignments[issue.id] === technician.id;
            const assignedAt = isPrimary
              ? technicianAssignmentTimes[issue.id]
              : additionalAssignmentTimes[issue.id];

            return {
              issue,
              assignedAt:
                issue.status === "in_progress"
                  ? issue.updated_at ?? assignedAt ?? issue.created_at
                  : assignedAt ?? issue.updated_at ?? issue.created_at,
            };
          })
          .sort((left, right) => {
            const leftTime = left.assignedAt
              ? new Date(left.assignedAt).getTime()
              : 0;
            const rightTime = right.assignedAt
              ? new Date(right.assignedAt).getTime()
              : 0;

            return leftTime - rightTime;
          });

        const workingIssues = activeIssues.filter(
          ({ issue }) => issue.status === "in_progress",
        );

        return {
          ...technician,
          activeIssues,
          currentIssue: workingIssues[0] ?? null,
          queueCount: activeIssues.filter(
            ({ issue }) => issue.status === "assigned",
          ).length,
        };
      }),
    [
      additionalAssignmentTimes,
      additionalAssignments,
      issues,
      technicianAssignmentTimes,
      technicianAssignments,
    ],
  );

  const toggleStatus = (status: string) => {
    setExpandedStatuses((current) => {
      const next = new Set(current);

      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }

      return next;
    });
  };

  const assignTechnician = async (
    issue: IssueRecord,
    technicianId: TemporaryTechnicianId,
  ) => {
    if (!activeShow) {
      return;
    }

    setAssigningIssueId(issue.id);
    setAssignmentFeedback(null);
    setAssignmentWarning(null);

    const { error: updateError } = await supabase
      .from("issues")
      .update({ status: "assigned" })
      .eq("id", issue.id)
      .eq("show_id", activeShow.id);

    if (updateError) {
      setAssignmentFeedback({
        type: "error",
        message: `Could not assign technician: ${updateError.message}`,
      });
      setAssigningIssueId(null);
      return;
    }

    setTemporaryTechnicianAssignment(issue.id, technicianId);

    const { error: historyError } = await supabase
      .from("issue_status_history")
      .insert({
        changed_by_user_id: null,
        issue_id: issue.id,
        new_status: "assigned",
        note: `Assigned to ${getTemporaryTechnicianLabel(technicianId)} and placed In Queue (temporary MVP assignment).`,
        old_status: issue.status,
      });

    setAssignmentFeedback({
      type: "success",
      message: `${getTemporaryTechnicianLabel(technicianId)} assigned. Issue moved to In Queue.`,
    });
    setAssignmentWarning(
      historyError
        ? getHistoryWriteFailureMessage(historyError.message)
        : null,
    );
    await refreshIssues();
    setAssigningIssueId(null);
  };

  const openEndSessionSummary = async () => {
    if (!sessionForActiveShow) {
      return;
    }

    const proposedEndAt = new Date().toISOString();
    setEndSessionStep("summary");
    setEndSessionSummary(null);
    setSessionSummaryError(null);
    setSessionSummaryWarning(null);
    setSessionMessage(null);
    setIsLoadingSessionSummary(true);

    const { data: sessionIssuesData, error: issuesError } = await supabase
      .from("issues")
      .select(
        "id, channel_number, cue_value, issue_type, status, position_name, created_at, updated_at",
      )
      .eq("session_id", sessionForActiveShow.id);

    if (issuesError) {
      setSessionSummaryError(
        `Could not load session issues: ${issuesError.message}`,
      );
      setIsLoadingSessionSummary(false);
      return;
    }

    const sessionIssues = (sessionIssuesData ?? []) as IssueRecord[];
    const issueIds = sessionIssues.map((issue) => issue.id);
    let historyRecords: SessionSummaryHistory[] = [];

    if (issueIds.length > 0) {
      const { data: historyData, error: historyError } = await supabase
        .from("issue_status_history")
        .select("issue_id, new_status, created_at")
        .in("issue_id", issueIds)
        .order("created_at", { ascending: true });

      if (historyError) {
        setSessionSummaryWarning(
          getHistoryReadFailureMessage(historyError.message),
        );
      } else {
        historyRecords = (historyData ?? []) as SessionSummaryHistory[];
      }
    }

    const historyByIssue = new Map<string, SessionSummaryHistory[]>();

    for (const history of historyRecords) {
      historyByIssue.set(history.issue_id, [
        ...(historyByIssue.get(history.issue_id) ?? []),
        history,
      ]);
    }

    const issueEnteredStatus = (issue: IssueRecord, status: string) =>
      issue.status === status ||
      (historyByIssue.get(issue.id) ?? []).some(
        (history) => history.new_status === status,
      );

    const averageAssignmentMs = getAverageDuration(
      sessionIssues.flatMap((issue) => {
        const assignedHistory = (historyByIssue.get(issue.id) ?? []).find(
          (history) =>
            history.new_status === "assigned" && history.created_at,
        );
        const createdAt = getTimestampValue(issue.created_at);
        const assignedAt = getTimestampValue(assignedHistory?.created_at);

        return createdAt > 0 && assignedAt >= createdAt
          ? [assignedAt - createdAt]
          : [];
      }),
    );

    const directorResponseDurations: number[] = [];

    for (const issue of sessionIssues) {
      const issueHistory = historyByIssue.get(issue.id) ?? [];

      issueHistory.forEach((history, index) => {
        if (!attentionStatuses.has(history.new_status)) {
          return;
        }

        const enteredAt = getTimestampValue(history.created_at);
        const responseAt = getTimestampValue(
          issueHistory
            .slice(index + 1)
            .find(
              (nextHistory) =>
                nextHistory.new_status !== history.new_status &&
                nextHistory.created_at,
            )?.created_at,
        );

        if (enteredAt > 0 && responseAt >= enteredAt) {
          directorResponseDurations.push(responseAt - enteredAt);
        }
      });
    }

    const involvedTechnicians = TEMPORARY_TECHNICIANS.filter(
      (technician) =>
        sessionIssues.some(
          (issue) =>
            technicianAssignments[issue.id] === technician.id ||
            additionalAssignments[issue.id] === technician.id,
        ),
    );

    const technicianPerformance = involvedTechnicians.map((technician) => {
      const assignedIssues = sessionIssues.filter(
        (issue) =>
          technicianAssignments[issue.id] === technician.id ||
          additionalAssignments[issue.id] === technician.id,
      );
      const completionDurations = assignedIssues.flatMap((issue) => {
        const isPrimary =
          technicianAssignments[issue.id] === technician.id;
        const assignedAt = getTimestampValue(
          isPrimary
            ? technicianAssignmentTimes[issue.id]
            : additionalAssignmentTimes[issue.id],
        );
        const completedAt = getTimestampValue(
          (historyByIssue.get(issue.id) ?? []).find(
            (history) =>
              terminalStatuses.has(history.new_status) &&
              history.created_at &&
              getTimestampValue(history.created_at) >= assignedAt,
          )?.created_at,
        );

        return assignedAt > 0 && completedAt >= assignedAt
          ? [completedAt - assignedAt]
          : [];
      });

      return {
        technicianId: technician.id,
        technicianName: technician.label,
        totalAssigned: assignedIssues.length,
        resolved: assignedIssues.filter((issue) =>
          resolvedStatuses.has(issue.status),
        ).length,
        unfixable: assignedIssues.filter(
          (issue) => issue.status === "unfixable",
        ).length,
        averageCompletionMs: getAverageDuration(completionDurations),
      };
    });

    setEndSessionSummary({
      proposedEndAt,
      totalTechnicians: involvedTechnicians.length,
      totalIssues: sessionIssues.length,
      resolvedIssues: sessionIssues.filter((issue) =>
        resolvedStatuses.has(issue.status),
      ).length,
      unfixableIssues: sessionIssues.filter(
        (issue) => issue.status === "unfixable",
      ).length,
      openIssues: sessionIssues.filter(
        (issue) => !terminalStatuses.has(issue.status),
      ).length,
      issuesRequiringParts: sessionIssues.filter((issue) =>
        issueEnteredStatus(issue, "retrieving_parts"),
      ).length,
      directorAssistanceRequests: sessionIssues.filter((issue) =>
        issueEnteredStatus(issue, "director_assistance_requested"),
      ).length,
      additionalTechnicianRequests: sessionIssues.filter((issue) =>
        issueEnteredStatus(issue, "additional_technician_requested"),
      ).length,
      averageAssignmentMs,
      averageDirectorResponseMs: getAverageDuration(
        directorResponseDurations,
      ),
      technicianPerformance,
    });
    setIsLoadingSessionSummary(false);

    // TODO(saved user reports): persist finalized session summaries per user.
    // TODO(downloadable one-page printable report): generate a compact printable export.
    // TODO(director report): add a dedicated Director performance report.
    // TODO(technician report): add per-technician performance reports.
  };

  const handleEndSession = async () => {
    if (!sessionForActiveShow) {
      return;
    }

    setIsEndingSession(true);
    setSessionMessage(null);

    const { error } = await supabase
      .from("continuity_sessions")
      .update({
        ended_at: new Date().toISOString(),
        ended_by_user_id: null,
        status: "ended",
      })
      .eq("id", sessionForActiveShow.id)
      .eq("show_id", sessionForActiveShow.show_id);

    if (error) {
      setSessionMessage(
        getContinuitySessionPolicyMessage(
          `Could not end continuity session: ${error.message}.`,
        ),
      );
    } else {
      setActiveContinuitySession(null);
      setEndSessionStep(null);
      setEndSessionSummary(null);
      setSessionMessage("Continuity session ended.");
    }

    setIsEndingSession(false);
  };

  const handleSubmitIssue = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreatedIssue(null);
    setErrorMessage(null);

    if (!activeShow) {
      setErrorMessage(
        "Select an active show before entering continuity issues.",
      );
      return;
    }

    if (!channelNumber || !cueValue.trim() || !issueType) {
      setErrorMessage(
        "Channel Number, Cue(s), and Issue Type are required.",
      );
      return;
    }

    setIsSubmitting(true);

    const insertValues = {
      assigned_to_user_id: null,
      channel_number: Number(channelNumber),
      created_by_user_id: null,
      cue_value: cueValue.trim(),
      effect_name: null,
      issue_source: "manual_director_entry",
      issue_type: issueType,
      session_id: sessionForActiveShow?.id ?? null,
      show_id: activeShow.id,
      status: "new",
      ...(isManual && positionName.trim()
        ? { position_name: positionName.trim() }
        : {}),
    };

    const { error } = await supabase.from("issues").insert(insertValues);

    if (error) {
      setErrorMessage(`Could not create issue: ${error.message}`);
    } else {
      setCreatedIssue({
        channelNumber: Number(channelNumber),
        cueValue: cueValue.trim(),
        issueType,
      });
      setChannelNumber("");
      setCueValue("");
      setPositionName("");
      setIssueType("");
      await refreshIssues();
    }

    setIsSubmitting(false);
  };

  return (
    <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-6 px-5 py-6 sm:px-8 xl:pr-[21rem] lg:py-8">
      <section className="rounded-lg border border-white/10 bg-[#0b1020]/90 p-4 shadow-2xl shadow-black/25">
        <div className="flex flex-col gap-1 border-b border-white/10 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a78bfa]">
              Director Console
            </p>
            <h1 className="mt-1 text-xl font-semibold text-white">
              Tech Overview
            </h1>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-[0.14em] text-[#94a3b8]">
                  Total Time In Continuity Checks
                </p>
                <p className="font-mono text-lg font-semibold text-white">
                  {sessionForActiveShow
                    ? formatElapsedTime(
                        sessionForActiveShow.started_at,
                        timerNow,
                      )
                    : "00:00:00"}
                </p>
              </div>
              {sessionForActiveShow ? (
                <button
                  className="rounded-md border border-[#ef4444]/45 bg-[#2a0b13] px-3 py-2 text-xs font-semibold text-[#fecaca]"
                  onClick={() => {
                    setSessionMessage(null);
                    setEndSessionStep("confirm");
                  }}
                  type="button"
                >
                  End Session
                </button>
              ) : null}
            </div>
            <p className="text-xs text-[#94a3b8]">
              {sessionForActiveShow?.name ?? "No active continuity session"}
            </p>
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
          {technicianOverview.map((technician) => (
            <TechOverviewCard
              currentIssue={technician.currentIssue}
              key={technician.id}
              loadCount={technician.activeIssues.length}
              now={timerNow}
              queueCount={technician.queueCount}
              technicianId={technician.id}
              technicianName={technician.label}
            />
          ))}
        </div>
      </section>

      {!activeShow ? (
        <section className="rounded-lg border border-[#4c00a4]/40 bg-[#130a2b]/90 p-6 opacity-80 shadow-xl shadow-black/20">
          <h2 className="text-xl font-semibold text-white">
            Select an active show before entering continuity issues.
          </h2>
          <p className="mt-3 text-sm leading-6 text-[#b6c3d1]">
            Issue entry is unavailable until a show is selected from the Shows
            page.
          </p>
        </section>
      ) : (
        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <form
            className="rounded-lg border border-white/10 bg-[#0b1020]/90 p-6 shadow-xl shadow-black/20"
            onSubmit={handleSubmitIssue}
          >
            <div className="flex flex-col gap-2 border-b border-white/10 pb-5">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">
                {isScripted ? "Scripted Show" : "Manual Show"}
              </p>
              <h2 className="text-2xl font-semibold text-white">
                New continuity issue entry
              </h2>
              <p className="text-sm leading-6 text-[#94a3b8]">
                {isScripted
                  ? "Position and effect will later resolve from imported script data."
                  : "Position is optional for manual shows."}
              </p>
            </div>

            <div className="mt-6 grid gap-5">
              <div
                className={`grid gap-4 ${
                  isManual ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-3"
                }`}
              >
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-[#dbe4ef]">
                    Channel Number
                  </span>
                  <input
                    className={fieldClassName}
                    min="0"
                    onChange={(event) => setChannelNumber(event.target.value)}
                    placeholder="Required"
                    step="1"
                    type="number"
                    value={channelNumber}
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-[#dbe4ef]">
                    Cue(s)
                  </span>
                  <input
                    className={fieldClassName}
                    onChange={(event) => setCueValue(event.target.value)}
                    placeholder="Required"
                    type="text"
                    value={cueValue}
                  />
                </label>
                {isManual ? (
                  <label className="flex flex-col gap-2">
                    <span className="text-sm font-semibold text-[#dbe4ef]">
                      Position
                    </span>
                    <input
                      className={fieldClassName}
                      onChange={(event) => setPositionName(event.target.value)}
                      placeholder="Optional"
                      type="text"
                      value={positionName}
                    />
                  </label>
                ) : null}
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-[#dbe4ef]">
                    Issue Type
                  </span>
                  <select
                    className={fieldClassName}
                    onChange={(event) =>
                      setIssueType(event.target.value as IssueType)
                    }
                    value={issueType}
                  >
                    <option value="" disabled>
                      Select issue type
                    </option>
                    <option value="no_continuity">No Continuity</option>
                    <option value="unexpected_continuity">
                      Unexpected Continuity
                    </option>
                    <option value="module_offline">Module Offline</option>
                  </select>
                </label>
              </div>

              {createdIssue ? (
                <p className="rounded-lg border border-[#2f6b51]/70 bg-[#0d251c]/95 p-3 text-sm font-semibold text-[#d8f3e3]">
                  Issue created:{" "}
                  <IssueIdentifiers
                    channelNumber={createdIssue.channelNumber}
                    cueValue={createdIssue.cueValue}
                    issueType={createdIssue.issueType}
                  />
                </p>
              ) : null}
              {errorMessage ? (
                <p className="rounded-lg border border-[#ef4444]/40 bg-[#2a0b13] p-3 text-sm font-semibold text-[#fecaca]">
                  {errorMessage}
                </p>
              ) : null}
              {!sessionForActiveShow ? (
                <p className="rounded-lg border border-[#f59e0b]/40 bg-[#2a1c06] p-3 text-sm font-semibold text-[#fde68a]">
                  Warning: no continuity session is active. This issue will be
                  created without a session.
                </p>
              ) : null}

              <div className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-xl text-sm leading-6 text-[#94a3b8]">
                  Creates a new continuity issue for the active show.
                </p>
                <button
                  className="rounded-lg bg-[#6d28d9] px-5 py-3 text-base font-semibold text-white shadow-lg shadow-[#4c00a4]/30 transition-colors hover:bg-[#7c3aed] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isSubmitting}
                  type="submit"
                >
                  {isSubmitting ? "Submitting..." : "Submit Issue"}
                </button>
              </div>
            </div>
          </form>

          <aside className="grid gap-6">
            <div className="rounded-lg border border-white/10 bg-[#0b1020]/90 p-6 shadow-xl shadow-black/20">
              <h2 className="text-xl font-semibold text-white">
                Last Submitted Issue
              </h2>
              {isLoadingIssues ? (
                <p className="mt-5 rounded-lg border border-dashed border-[#475569] bg-[#070b18] p-4 text-sm text-[#94a3b8]">
                  Loading latest issue...
                </p>
              ) : !latestIssue ? (
                <p className="mt-5 rounded-lg border border-dashed border-[#475569] bg-[#070b18] p-5 text-sm leading-6 text-[#94a3b8]">
                  No activity is displayed yet.
                </p>
              ) : (
                <Link
                  className="mt-5 block rounded-lg border border-white/10 bg-[#070b18] p-4 transition-colors hover:border-[#8b5cf6]/60"
                  href={`/issues/${latestIssue.id}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <time className="text-xs font-semibold text-[#94a3b8]">
                      {formatActivityTime(latestIssue.created_at)}
                    </time>
                    <span
                      className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${getIssueStatusClassName(latestIssue.status)}`}
                    >
                      {formatIssueLabel(latestIssue.status)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-[#dbe4ef]">
                    <IssueIdentifiers
                      channelNumber={latestIssue.channel_number}
                      cueValue={latestIssue.cue_value}
                      issueType={latestIssue.issue_type}
                    />
                  </p>
                  {latestIssue.position_name ? (
                    <p className="mt-1 text-xs text-[#94a3b8]">
                      Position: {latestIssue.position_name}
                    </p>
                  ) : null}
                </Link>
              )}
            </div>

            <div className="rounded-lg border border-white/10 bg-[#0b1020]/90 p-5 shadow-xl shadow-black/20">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-white">
                  Issue Summary
                </h2>
                <span className="text-sm font-semibold text-[#94a3b8]">
                  Total {issues.length}
                </span>
              </div>
              {statusGroups.length === 0 ? (
                <p className="mt-4 text-sm text-[#64748b]">
                  No issue statuses to summarize.
                </p>
              ) : (
                <div className="mt-4 grid gap-2">
                  {statusGroups.map(({ issues: statusIssues, status }) => (
                    <div
                      key={status}
                    >
                      <button
                        aria-expanded={expandedStatuses.has(status)}
                        className={`flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left ${getIssueStatusClassName(status)}`}
                        onClick={() => toggleStatus(status)}
                        type="button"
                      >
                        <span className="truncate text-xs font-semibold">
                          {formatIssueLabel(status)}
                        </span>
                        <span className="flex items-center gap-2">
                          <strong className="text-sm">
                            {statusIssues.length}
                          </strong>
                          <span className="text-xs">
                            {expandedStatuses.has(status) ? "-" : "+"}
                          </span>
                        </span>
                      </button>
                      {expandedStatuses.has(status) ? (
                        <div className="mt-1 grid gap-1 border-l border-white/10 pl-2">
                          {statusIssues.map((issue) => (
                            <div
                              className="rounded-md border border-white/10 bg-[#070b18] px-3 py-2 text-xs text-[#dbe4ef] transition-colors hover:border-[#8b5cf6]/60"
                              key={issue.id}
                            >
                              <span className="flex items-start justify-between gap-3">
                                <Link
                                  className="min-w-0 hover:text-white"
                                  href={`/issues/${issue.id}`}
                                >
                                  <IssueIdentifiers
                                    channelNumber={issue.channel_number}
                                    cueValue={issue.cue_value}
                                    issueType={issue.issue_type}
                                  />
                                </Link>
                                {status === "new" ? (
                                  <select
                                    aria-label={`Assign technician to channel ${issue.channel_number}, cue ${issue.cue_value}`}
                                    className="h-8 max-w-32 shrink-0 rounded-md border border-[#8b5cf6]/40 bg-[#130a2b] px-2 text-xs font-semibold text-white outline-none focus:border-[#a78bfa]"
                                    disabled={assigningIssueId === issue.id}
                                    onChange={(event) => {
                                      const technicianId = event.target
                                        .value as TemporaryTechnicianId | "";

                                      if (technicianId) {
                                        void assignTechnician(
                                          issue,
                                          technicianId,
                                        );
                                      }
                                    }}
                                    value=""
                                  >
                                    <option value="">Assign Tech</option>
                                    {TEMPORARY_TECHNICIANS.map(
                                      (technician) => (
                                        <option
                                          key={technician.id}
                                          value={technician.id}
                                        >
                                          {technician.label}
                                        </option>
                                      ),
                                    )}
                                  </select>
                                ) : (
                                  <span className="shrink-0 text-right font-semibold text-[#cbd5e1]">
                                    {getTemporaryTechnicianLabel(
                                      technicianAssignments[issue.id],
                                    )}
                                  </span>
                                )}
                              </span>
                              {issue.position_name ? (
                                <span className="mt-1 block text-[#94a3b8]">
                                  Position: {issue.position_name}
                                </span>
                              ) : null}
                              {latestIssueNotes[issue.id] ? (
                                <span className="mt-1 block text-[11px] italic text-[#aab4c3]">
                                  Note: {latestIssueNotes[issue.id]}
                                </span>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
              {issueLoadError ? (
                <p className="mt-4 text-xs font-semibold text-[#f28b82]">
                  {issueLoadError}
                </p>
              ) : null}
              {assignmentFeedback ? (
                <p
                  className={`mt-3 text-xs font-semibold ${
                    assignmentFeedback.type === "success"
                      ? "text-[#bbf7d0]"
                      : "text-[#fecaca]"
                  }`}
                >
                  {assignmentFeedback.message}
                </p>
              ) : null}
              {assignmentWarning ? (
                <p className="mt-2 text-xs font-semibold leading-5 text-[#fde68a]">
                  {assignmentWarning}
                </p>
              ) : null}
            </div>
          </aside>
        </section>
      )}
      <DirectorAttentionQueue onIssueUpdated={refreshIssues} />
      {endSessionStep === "confirm" && sessionForActiveShow ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-5"
          role="dialog"
        >
          <div className="w-full max-w-md rounded-lg border border-white/10 bg-[#0b1020] p-6 shadow-2xl shadow-black/50">
            <h2 className="text-xl font-semibold text-white">
              Are you sure you want to end this continuity session?
            </h2>
            <p className="mt-3 text-sm italic text-[#b6c3d1]">
              {sessionForActiveShow.name}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                className="rounded-md border border-white/15 px-4 py-2 text-sm font-semibold text-[#cbd5e1]"
                onClick={() => setEndSessionStep(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-[#6d28d9] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#7c3aed]"
                onClick={() => void openEndSessionSummary()}
                type="button"
              >
                Yes, Review Summary
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {endSessionStep === "summary" && sessionForActiveShow ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 sm:p-6"
          role="dialog"
        >
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-lg border border-white/10 bg-[#0b1020] shadow-2xl shadow-black/50">
            <header className="border-b border-white/10 px-5 py-4 sm:px-7">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#a78bfa]">
                End Session Summary Report
              </p>
              <h2 className="mt-1 text-xl font-semibold text-white">
                Continuity session performance
              </h2>
            </header>

            <div className="px-5 py-4 sm:px-7">
              {isLoadingSessionSummary ? (
                <p className="py-10 text-center text-sm text-[#94a3b8]">
                  Building session summary...
                </p>
              ) : sessionSummaryError ? (
                <p className="border-y border-[#ef4444]/35 py-4 text-sm font-semibold text-[#fecaca]">
                  {sessionSummaryError}
                </p>
              ) : endSessionSummary ? (
                <div className="grid gap-5">
                  <ReportSection title="Session Summary">
                    <ReportRow
                      label="Show"
                      value={activeShow?.name ?? "Unavailable"}
                    />
                    <ReportRow
                      label="Session"
                      value={sessionForActiveShow.name}
                    />
                    <ReportRow
                      label="Start"
                      value={formatDateTime(
                        sessionForActiveShow.started_at,
                      )}
                    />
                    <ReportRow
                      label="End"
                      value={formatDateTime(
                        endSessionSummary.proposedEndAt,
                      )}
                    />
                    <ReportRow
                      label="Session Duration"
                      value={formatDuration(
                        getTimestampValue(
                          endSessionSummary.proposedEndAt,
                        ) -
                          getTimestampValue(
                            sessionForActiveShow.started_at,
                          ),
                      )}
                    />
                    <ReportRow
                      label="Total Technicians"
                      value={String(endSessionSummary.totalTechnicians)}
                    />
                  </ReportSection>

                  <ReportSection title="Issue Summary">
                    <ReportRow
                      label="Total Issues"
                      value={String(endSessionSummary.totalIssues)}
                    />
                    <ReportRow
                      label="Open"
                      value={String(endSessionSummary.openIssues)}
                    />
                    <ReportRow
                      label="Resolved"
                      value={String(endSessionSummary.resolvedIssues)}
                    />
                    <ReportRow
                      label="Unfixable"
                      value={String(endSessionSummary.unfixableIssues)}
                    />
                    <ReportRow
                      label="Required Parts"
                      value={String(
                        endSessionSummary.issuesRequiringParts,
                      )}
                    />
                    <ReportRow
                      label="Director Assistance"
                      value={String(
                        endSessionSummary.directorAssistanceRequests,
                      )}
                    />
                    <ReportRow
                      label="Additional Tech Requested"
                      value={String(
                        endSessionSummary.additionalTechnicianRequests,
                      )}
                    />
                  </ReportSection>

                  <ReportSection title="Director Performance">
                    <ReportRow
                      label="Average Assignment Time"
                      value={formatDuration(
                        endSessionSummary.averageAssignmentMs,
                      )}
                    />
                    <ReportRow
                      label="Average Director Response Time"
                      value={formatDuration(
                        endSessionSummary.averageDirectorResponseMs,
                      )}
                    />
                  </ReportSection>

                  <section>
                    <h3 className="border-b border-white/15 pb-2 text-sm font-semibold uppercase tracking-[0.12em] text-[#d8c8ff]">
                      Technician Performance
                    </h3>
                    {endSessionSummary.technicianPerformance.length ===
                    0 ? (
                      <p className="py-3 text-sm text-[#94a3b8]">
                        No temporary technician assignments were recorded for
                        this session.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[38rem] text-left text-sm">
                          <thead className="border-b border-white/10 text-xs uppercase text-[#94a3b8]">
                            <tr>
                              <th className="py-2 pr-4 font-semibold">
                                Tech Name
                              </th>
                              <th className="px-3 py-2 text-right font-semibold">
                                Assigned
                              </th>
                              <th className="px-3 py-2 text-right font-semibold">
                                Resolved
                              </th>
                              <th className="px-3 py-2 text-right font-semibold">
                                Unfixable
                              </th>
                              <th className="py-2 pl-4 text-right font-semibold">
                                Avg Completion
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/10 text-[#dbe4ef]">
                            {endSessionSummary.technicianPerformance.map(
                              (technician) => (
                                <tr key={technician.technicianId}>
                                  <td className="py-2.5 pr-4 font-semibold text-white">
                                    {technician.technicianName}
                                  </td>
                                  <td className="px-3 py-2.5 text-right">
                                    {technician.totalAssigned}
                                  </td>
                                  <td className="px-3 py-2.5 text-right">
                                    {technician.resolved}
                                  </td>
                                  <td className="px-3 py-2.5 text-right">
                                    {technician.unfixable}
                                  </td>
                                  <td className="py-2.5 pl-4 text-right">
                                    {formatDuration(
                                      technician.averageCompletionMs,
                                    )}
                                  </td>
                                </tr>
                              ),
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                </div>
              ) : null}

              {sessionSummaryWarning ? (
                <p className="mt-4 border-t border-[#f59e0b]/30 pt-3 text-xs font-semibold leading-5 text-[#fde68a]">
                  {sessionSummaryWarning}
                </p>
              ) : null}
              {sessionMessage ? (
                <p className="mt-4 border-t border-[#ef4444]/30 pt-3 text-xs font-semibold leading-5 text-[#fecaca]">
                  {sessionMessage}
                </p>
              ) : null}
              <p className="mt-4 border-t border-white/10 pt-3 text-xs italic leading-5 text-[#94a3b8]">
                Performance averages appear only when reliable history
                timestamps are available. This report is not saved or exported.
              </p>
            </div>

            <footer className="flex justify-end gap-3 border-t border-white/10 px-5 py-4 sm:px-7">
              <button
                className="rounded-md border border-white/15 px-4 py-2 text-sm font-semibold text-[#cbd5e1]"
                disabled={isEndingSession}
                onClick={() => setEndSessionStep("confirm")}
                type="button"
              >
                Cancel / Back
              </button>
              <button
                className="rounded-md bg-[#b91c1c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                disabled={
                  isEndingSession ||
                  isLoadingSessionSummary ||
                  Boolean(sessionSummaryError)
                }
                onClick={() => void handleEndSession()}
                type="button"
              >
                {isEndingSession ? "Ending..." : "End Session"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
      {endSessionStep === null && sessionMessage ? (
        <p className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2 rounded-lg border border-white/10 bg-[#111827] px-4 py-3 text-sm font-semibold text-[#dbe4ef] shadow-xl">
          {sessionMessage}
        </p>
      ) : null}
    </div>
  );
}

function ReportSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section>
      <h3 className="border-b border-white/15 pb-2 text-sm font-semibold uppercase tracking-[0.12em] text-[#d8c8ff]">
        {title}
      </h3>
      <dl className="divide-y divide-white/10">{children}</dl>
    </section>
  );
}

function ReportRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(8rem,1.35fr)] gap-4 py-2 text-sm">
      <dt className="text-[#94a3b8]">{label}:</dt>
      <dd className="text-right font-semibold text-[#f8fafc]">{value}</dd>
    </div>
  );
}

function TechOverviewCard({
  currentIssue,
  loadCount,
  now,
  queueCount,
  technicianId,
  technicianName,
}: {
  currentIssue: {
    issue: IssueRecord;
    assignedAt: string | null;
  } | null;
  loadCount: number;
  now: number | null;
  queueCount: number;
  technicianId: TemporaryTechnicianId;
  technicianName: string;
}) {
  const workloadClassName =
    loadCount >= 4
      ? "border-[#ef4444]/45 bg-[#2a0b13]"
      : loadCount >= 2
        ? "border-[#f59e0b]/45 bg-[#2a1c06]"
        : "border-[#22c55e]/40 bg-[#082515]";

  return (
    <Link
      aria-label={`Open Technician Console as ${technicianName}`}
      className={`block cursor-pointer rounded-lg border p-3 transition duration-150 hover:brightness-110 hover:shadow-[0_0_18px_rgba(167,139,250,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a78bfa] ${workloadClassName}`}
      href="/technician"
      onClick={() => setSelectedTemporaryTechnician(technicianId)}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-white">
          {technicianName}
        </h2>
        <span className="text-xs font-bold text-[#dbe4ef]">
          Load {loadCount}
        </span>
      </div>
      {currentIssue ? (
        <div className="mt-2 grid gap-1">
          <p className="truncate text-xs text-[#dbe4ef]">
            <IssueIdentifiers
              channelNumber={currentIssue.issue.channel_number}
              cueValue={currentIssue.issue.cue_value}
              issueType={currentIssue.issue.issue_type}
            />
          </p>
          <p className="font-mono text-xs font-semibold text-[#cbd5e1]">
            {formatElapsedTime(currentIssue.assignedAt, now)}
          </p>
        </div>
      ) : (
        <p className="mt-2 text-xs text-[#94a3b8]">
          {queueCount > 0 ? `In Queue: ${queueCount}` : "No active issue"}
        </p>
      )}
    </Link>
  );
}
