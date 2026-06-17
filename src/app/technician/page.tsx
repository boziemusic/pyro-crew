"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  setActiveShow,
  useActiveShow,
} from "@/components/active-show-strip";
import {
  setActiveContinuitySession,
  useActiveContinuitySession,
} from "@/components/active-continuity-session";
import {
  formatIssueLabel,
  getIssueStatusClassName,
  IssueIdentifiers,
  ISSUE_IDENTIFIER_VALUE_CLASS_NAME,
} from "@/components/issue-identifiers";
import {
  getTemporaryTechnicianLabel,
  TEMPORARY_TECHNICIANS,
  type TemporaryTechnicianId,
  setSelectedTemporaryTechnician,
  useSelectedTemporaryTechnician,
} from "@/components/temporary-technician-store";
import {
  fetchActiveIssueAssignments,
  setActiveIssueAssignmentAcknowledgedAt,
  type IssueAssignment,
} from "@/components/issue-assignment-store";
import {
  acknowledgeTechnicianNotice,
  fetchActiveAdditionalTechnicianAssignments,
  parseHandoffNoticePayload,
  recordTechnicianHeartbeat,
  type TechnicianNotice,
  type HandoffNoticePayload,
  updateIncomingHandoffNotice,
  useTechnicianNotices,
} from "@/components/collaboration-store";
import {
  getHistoryReadFailureMessage,
  getHistoryWriteFailureMessage,
} from "@/lib/issue-status-history";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { TechnicianMapAssist } from "@/components/technician-map-assist";
import { MobileTechnicianAlertToggle } from "@/components/app-feedback-controls";
import {
  playSuccess,
  playUiClick,
  playWarning,
  vibrate,
} from "@/lib/app-feedback";

type TechnicianIssue = {
  id: string;
  channel_number: number;
  cue_value: string;
  issue_type: string;
  position_name: string | null;
  effect_name: string | null;
  status: string;
  session_id: string | null;
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
  old_status: string | null;
  created_at: string | null;
};

type TechnicianQueryName =
  | "issues"
  | "status history"
  | "resolution notices"
  | "assignments"
  | "map assist data";

type TechnicianQueryDiagnostic = {
  status: "idle" | "loading" | "loaded" | "error" | "local";
  error: string | null;
};

type MobileSection =
  | "assigned"
  | "working"
  | "awaiting-director"
  | "resolutions";

type SharedHandoff = HandoffNoticePayload & {
  id: string;
  reassignedAt: string;
  handoffNote: string | null;
};

type DirectorReturnPopup = {
  issue: TechnicianIssue;
  note: string | null;
  noticeId: string;
  noticeType: string;
  previousStatus: string | null;
  statusLabel: string;
};

type DirectorReturnPopupContent = {
  headline: string;
  note: string | null;
  subtext: string | null;
};

type SessionStatusRecord = {
  ended_at: string | null;
  id: string;
  status: string;
};

type ScoreboardIssue = {
  id: string;
  status: string;
  created_at: string | null;
};

type ScoreboardHistory = {
  issue_id: string;
  new_status: string;
  created_at: string | null;
};

type ScoreboardAssignment = {
  issue_id: string;
  technician_name: string;
  assigned_at: string | null;
};

type ScoreboardAdditionalAssignment = {
  issue_id: string;
  additional_technician_name: string;
  assigned_at: string | null;
};

type ScoreboardNotice = {
  technician_name: string;
};

type TechnicianScoreboardEntry = {
  averageResolutionMs: number | null;
  effortActions: number;
  hitRate: number;
  issuesResolved: number;
  issuesWorked: number;
  notFixedReturns: number;
  score: number;
  technicianName: string;
};

const initialQueryDiagnostics: Record<
  TechnicianQueryName,
  TechnicianQueryDiagnostic
> = {
  assignments: { status: "idle", error: null },
  issues: { status: "idle", error: null },
  "map assist data": { status: "idle", error: null },
  "resolution notices": { status: "idle", error: null },
  "status history": { status: "idle", error: null },
};

const STATUS_ACTIONS: StatusAction[] = [
  {
    label: "Start Working",
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

const workingStatuses = new Set(["in_progress", "retrieving_parts"]);

const awaitingDirectorStatuses = new Set([
  "director_assistance_requested",
  "additional_technician_requested",
  "awaiting_verification",
  "unfixable_recommended",
]);

const actionConfirmationMessages: Record<string, string> = {
  retrieving_parts:
    "Sent note to the Director letting them know you're going to retrieve parts for this issue.",
  director_assistance_requested: "Communication sent to the Director.",
  additional_technician_requested:
    "Request for assistance sent to the Director.",
  awaiting_verification: "Verification request sent to the Director.",
};

const directorReturnNoticeTypes = new Set([
  "verification_passed",
  "verification_failed",
  "retrieving_parts",
  "director_response",
  "additional_tech_approved",
  "additional_tech_declined",
  "unfixable",
  "reassigned",
  "handoff",
  // Legacy notice types remain readable for older unread records.
  "additional_help_assigned",
  "additional_assignment",
  "handoff_incoming",
  "handoff_outgoing",
  "reassignment",
  "resolution",
]);

const resolutionNoticeTypes = new Set([
  "resolution",
  "verification_passed",
  "unfixable",
]);

function getTimestampValue(value: string | null | undefined) {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatScoreboardDuration(value: number | null) {
  if (!value || value <= 0) {
    return "—";
  }

  const totalSeconds = Math.round(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function getAverageScoreboardDuration(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function calculateScoreboardEntry({
  assignments,
  historiesByIssue,
  issuesById,
  technicianName,
}: {
  assignments: {
    assignedAt: string | null;
    issueId: string;
  }[];
  historiesByIssue: Map<string, ScoreboardHistory[]>;
  issuesById: Map<string, ScoreboardIssue>;
  technicianName: string;
}): TechnicianScoreboardEntry {
  const issueIds = [...new Set(assignments.map((assignment) => assignment.issueId))];
  const effortStatuses = new Set([
    "retrieving_parts",
    "additional_technician_requested",
    "director_assistance_requested",
    "unfixable",
    "unfixable_recommended",
  ]);
  let issuesResolved = 0;
  let effortActions = 0;
  let notFixedReturns = 0;
  const resolutionDurations: number[] = [];

  for (const issueId of issueIds) {
    const issue = issuesById.get(issueId);
    const histories = historiesByIssue.get(issueId) ?? [];
    const terminalHistory = histories.find((history) =>
      ["verified_resolved", "closed", "unfixable"].includes(
        history.new_status,
      ),
    );
    const resolved =
      issue &&
      ["verified_resolved", "closed", "unfixable"].includes(issue.status);

    if (resolved) {
      issuesResolved += 1;
    }

    effortActions += histories.filter((history) =>
      effortStatuses.has(history.new_status),
    ).length;
    notFixedReturns += histories.filter(
      (history) => history.new_status === "verification_failed",
    ).length;

    const earliestAssignedAt = Math.min(
      ...assignments
        .filter((assignment) => assignment.issueId === issueId)
        .map((assignment) => getTimestampValue(assignment.assignedAt))
        .filter((timestamp) => timestamp > 0),
    );
    const completedAt = getTimestampValue(terminalHistory?.created_at);

    if (
      Number.isFinite(earliestAssignedAt) &&
      earliestAssignedAt > 0 &&
      completedAt >= earliestAssignedAt
    ) {
      resolutionDurations.push(completedAt - earliestAssignedAt);
    }
  }

  const issuesWorked = issueIds.length;
  const hitRate = issuesWorked > 0 ? issuesResolved / issuesWorked : 0;
  const unfixableHandled = issueIds.filter(
    (issueId) => issuesById.get(issueId)?.status === "unfixable",
  ).length;
  const score = Math.max(
    0,
    Math.round(
      issuesResolved * 100 +
        effortActions * 10 +
        unfixableHandled * 25 +
        hitRate * 50 +
        issuesWorked * 5 -
        notFixedReturns * 15,
    ),
  );

  return {
    averageResolutionMs: getAverageScoreboardDuration(resolutionDurations),
    effortActions,
    hitRate,
    issuesResolved,
    issuesWorked,
    notFixedReturns,
    score,
    technicianName,
  };
}

function isDirectorReturnNotice(notice: TechnicianNotice) {
  return (
    Boolean(notice.issue_id) &&
    directorReturnNoticeTypes.has(notice.notice_type)
  );
}

function getAdditionalHelperName(message: string | null) {
  const match =
    message?.match(/^(.+?)\s+was assigned to help you\./i) ??
    message?.match(/^Additional technician\s+(.+?)\s+assigned/i);
  return match?.[1]?.trim() ?? null;
}

function humanizeNoticeType(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getDirectorReturnPopupContent(
  popup: DirectorReturnPopup,
): DirectorReturnPopupContent {
  const note = popup.note?.trim() || null;

  if (
    popup.noticeType === "verification_passed" ||
    (popup.noticeType === "resolution" &&
      popup.issue.status === "verified_resolved")
  ) {
    return {
      headline: "Issue Fixed!",
      note: null,
      subtext: "The Director confirmed your repair.",
    };
  }

  if (popup.noticeType === "verification_failed") {
    return {
      headline: "Not Fixed. Recheck This Issue.",
      note,
      subtext: note
        ? null
        : "The Director is sending this back for another look.",
    };
  }

  if (popup.noticeType === "retrieving_parts") {
    return {
      headline: "The Director wants you to Retrieve Parts!",
      note,
      subtext: null,
    };
  }

  if (
    popup.noticeType === "unfixable" ||
    (popup.noticeType === "resolution" &&
      popup.issue.status === "unfixable")
  ) {
    return {
      headline: "Marking this issue unfixable. Move on.",
      note,
      subtext: null,
    };
  }

  if (
    popup.noticeType === "additional_tech_approved" ||
    popup.noticeType === "additional_help_assigned" ||
    popup.noticeType === "additional_assignment"
  ) {
    const helperName = getAdditionalHelperName(popup.note);
    return {
      headline: helperName
        ? `The Director is sending ${helperName} to help you.`
        : "The Director is sending help to you.",
      note,
      subtext: null,
    };
  }

  if (popup.noticeType === "additional_tech_declined") {
    return {
      headline:
        "The Director responded to your request for another technician.",
      note,
      subtext: note
        ? null
        : "No additional technician is being sent right now.",
    };
  }

  if (popup.noticeType === "director_response") {
    return {
      headline: "The Director responded to your request.",
      note,
      subtext: null,
    };
  }

  if (
    popup.noticeType === "reassigned" ||
    popup.noticeType === "reassignment" ||
    popup.noticeType === "handoff_outgoing"
  ) {
    return {
      headline: "This issue has been reassigned.",
      note,
      subtext: null,
    };
  }

  if (
    popup.noticeType === "handoff" ||
    popup.noticeType === "handoff_incoming"
  ) {
    return {
      headline: "You have a handoff update.",
      note,
      subtext: null,
    };
  }

  return {
    headline: "The Director updated your issue.",
    note: null,
    subtext:
      popup.noticeType && popup.noticeType !== "director_response"
        ? humanizeNoticeType(popup.noticeType)
        : popup.statusLabel,
  };
}

export default function TechnicianConsolePage() {
  const router = useRouter();
  const activeShow = useActiveShow();
  const activeSession = useActiveContinuitySession();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const selectedTechnician = useSelectedTemporaryTechnician();
  const {
    error: noticesError,
    isLoading: noticesLoading,
    notices,
    refresh: refreshNotices,
  } = useTechnicianNotices(
    activeShow?.id,
    activeSession && activeSession.show_id === activeShow?.id
      ? activeSession.id
      : null,
    selectedTechnician,
  );
  const [issues, setIssues] = useState<TechnicianIssue[]>([]);
  const [activeAssignments, setActiveAssignments] = useState<
    IssueAssignment[]
  >([]);
  const [activeQueueIssueIds, setActiveQueueIssueIds] = useState<
    Set<string>
  >(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [updatingIssueId, setUpdatingIssueId] = useState<string | null>(null);
  const [noteIssueId, setNoteIssueId] = useState<string | null>(null);
  const [noteStatus, setNoteStatus] = useState<
    | "retrieving_parts"
    | "director_assistance_requested"
    | "additional_technician_requested"
    | null
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
  const [latestPreviousStatuses, setLatestPreviousStatuses] = useState<
    Record<string, string>
  >({});
  const [historyReadWarning, setHistoryReadWarning] = useState<
    string | null
  >(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [actionConfirmation, setActionConfirmation] = useState<
    string | null
  >(null);
  const [directorReturnPopup, setDirectorReturnPopup] =
    useState<DirectorReturnPopup | null>(null);
  const [sessionEndedPopup, setSessionEndedPopup] = useState<{
    entries: TechnicianScoreboardEntry[];
    error: string | null;
    isLoading: boolean;
    sessionId: string;
  } | null>(null);
  const [isManuallyRefreshing, setIsManuallyRefreshing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "connected" | "disconnected"
  >("connected");
  const [handoffNotes, setHandoffNotes] = useState<Record<string, string>>(
    {},
  );
  const [mapAssistIssue, setMapAssistIssue] =
    useState<TechnicianIssue | null>(null);
  const [, setQueryDiagnostics] = useState(
    initialQueryDiagnostics,
  );
  const [mobileSection, setMobileSection] =
    useState<MobileSection>("assigned");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const hasSelectedMobileSection = useRef(false);
  const issueAlertSnapshot = useRef<Map<string, string> | null>(null);
  const noticeAlertSnapshot = useRef<Set<string> | null>(null);
  const pendingDirectorReturnNoticeIds = useRef<Set<string>>(new Set());
  const handledDirectorReturnNoticeIds = useRef<Set<string>>(new Set());
  const sessionStatusSnapshot = useRef<string | null>(null);
  const shownEndedSessionIds = useRef<Set<string>>(new Set());
  const lastSuccessfulConnectionAt = useRef(0);

  useEffect(() => {
    issueAlertSnapshot.current = null;
    noticeAlertSnapshot.current = null;
    pendingDirectorReturnNoticeIds.current = new Set();
    handledDirectorReturnNoticeIds.current = new Set();
    sessionStatusSnapshot.current = null;

    const resetId = window.setTimeout(() => {
      setDirectorReturnPopup(null);
      setSessionEndedPopup(null);
    }, 0);

    return () => window.clearTimeout(resetId);
  }, [activeSession?.id, activeShow?.id, selectedTechnician]);

  const updateQueryDiagnostic = useCallback(
    (
      query: TechnicianQueryName,
      diagnostic: TechnicianQueryDiagnostic,
    ) => {
      setQueryDiagnostics((current) => ({
        ...current,
        [query]: diagnostic,
      }));
    },
    [],
  );
  const updateMapAssistDiagnostic = useCallback(
    (
      status: "loading" | "loaded" | "error",
      error: string | null,
    ) => {
      updateQueryDiagnostic("map assist data", { status, error });
    },
    [updateQueryDiagnostic],
  );

  const markConnected = useCallback(() => {
    lastSuccessfulConnectionAt.current = Date.now();
    setConnectionStatus("connected");
  }, []);

  const loadSessionScoreboard = useCallback(
    async (sessionId: string) => {
      if (!activeShow) {
        return {
          entries: [] as TechnicianScoreboardEntry[],
          error: "No active show available for scoreboard.",
        };
      }

      const { data: issueData, error: issueError } = await supabase
        .from("issues")
        .select("id, status, created_at")
        .eq("show_id", activeShow.id)
        .eq("session_id", sessionId);

      if (issueError) {
        return { entries: [], error: issueError.message };
      }

      const issues = (issueData ?? []) as ScoreboardIssue[];
      const issueIds = issues.map((issue) => issue.id);
      const [
        historyResult,
        assignmentResult,
        additionalAssignmentResult,
        noticeResult,
      ] = await Promise.all([
        issueIds.length > 0
          ? supabase
              .from("issue_status_history")
              .select("issue_id, new_status, created_at")
              .in("issue_id", issueIds)
              .order("created_at", { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from("issue_assignments")
          .select("issue_id, technician_name, assigned_at")
          .eq("show_id", activeShow.id)
          .eq("session_id", sessionId),
        supabase
          .from("additional_technician_assignments")
          .select("issue_id, additional_technician_name, assigned_at")
          .eq("show_id", activeShow.id)
          .eq("session_id", sessionId),
        supabase
          .from("technician_notices")
          .select("technician_name")
          .eq("show_id", activeShow.id)
          .eq("session_id", sessionId),
      ]);
      const queryError =
        historyResult.error ??
        assignmentResult.error ??
        additionalAssignmentResult.error ??
        noticeResult.error;

      if (queryError) {
        return { entries: [], error: queryError.message };
      }

      const histories = (historyResult.data ?? []) as ScoreboardHistory[];
      const primaryAssignments =
        (assignmentResult.data ?? []) as ScoreboardAssignment[];
      const additionalAssignments =
        (additionalAssignmentResult.data ??
          []) as ScoreboardAdditionalAssignment[];
      const notices = (noticeResult.data ?? []) as ScoreboardNotice[];
      const historiesByIssue = new Map<string, ScoreboardHistory[]>();
      const issuesById = new Map(issues.map((issue) => [issue.id, issue]));
      const assignmentsByTechnician = new Map<
        string,
        { assignedAt: string | null; issueId: string }[]
      >();

      histories.forEach((history) => {
        historiesByIssue.set(history.issue_id, [
          ...(historiesByIssue.get(history.issue_id) ?? []),
          history,
        ]);
      });

      const addAssignment = (
        technicianName: string | null | undefined,
        issueId: string,
        assignedAt: string | null,
      ) => {
        const normalizedName = technicianName?.trim();

        if (!normalizedName) {
          return;
        }

        assignmentsByTechnician.set(normalizedName, [
          ...(assignmentsByTechnician.get(normalizedName) ?? []),
          { assignedAt, issueId },
        ]);
      };

      primaryAssignments.forEach((assignment) =>
        addAssignment(
          assignment.technician_name,
          assignment.issue_id,
          assignment.assigned_at,
        ),
      );
      additionalAssignments.forEach((assignment) =>
        addAssignment(
          assignment.additional_technician_name,
          assignment.issue_id,
          assignment.assigned_at,
        ),
      );
      notices.forEach((notice) => {
        if (!assignmentsByTechnician.has(notice.technician_name)) {
          assignmentsByTechnician.set(notice.technician_name, []);
        }
      });

      const entries = [...assignmentsByTechnician.entries()]
        .map(([technicianName, assignments]) =>
          calculateScoreboardEntry({
            assignments,
            historiesByIssue,
            issuesById,
            technicianName,
          }),
        )
        .sort((left, right) => {
          if (right.score !== left.score) {
            return right.score - left.score;
          }
          if (right.issuesResolved !== left.issuesResolved) {
            return right.issuesResolved - left.issuesResolved;
          }
          return right.issuesWorked - left.issuesWorked;
        });

      return { entries, error: null };
    },
    [activeShow, supabase],
  );

  const fetchIssues = useCallback(async () => {
    if (
      !activeShow ||
      !activeSession ||
      activeSession.show_id !== activeShow.id
    ) {
      return {
        assignments: [],
        data: [],
        error: null,
        failedQuery: null,
        queueIssueIds: [],
      };
    }

    const [
      { data: assignmentData, error: assignmentError },
      { data: additionalAssignmentData, error: additionalAssignmentError },
    ] = await Promise.all([
      fetchActiveIssueAssignments({
        sessionId: activeSession.id,
        showId: activeShow.id,
        technicianId: selectedTechnician,
      }),
      fetchActiveAdditionalTechnicianAssignments({
        sessionId: activeSession.id,
        showId: activeShow.id,
        technicianId: selectedTechnician,
      }),
    ]);

    if (assignmentError || additionalAssignmentError) {
      return {
        assignments: [],
        data: [],
        error: assignmentError ?? additionalAssignmentError,
        failedQuery: "assignments" as const,
        queueIssueIds: [],
      };
    }

    const selectedAssignments =
      (assignmentData ?? []) as IssueAssignment[];
    const helperIssueIds = (additionalAssignmentData ?? []).map(
      (assignment) => assignment.issue_id as string,
    );
    let helperPrimaryAssignments: IssueAssignment[] = [];

    if (helperIssueIds.length > 0) {
      const { data: allAssignmentData, error: allAssignmentError } =
        await fetchActiveIssueAssignments({
          sessionId: activeSession.id,
          showId: activeShow.id,
        });

      if (allAssignmentError) {
        return {
          assignments: [],
          data: [],
          error: allAssignmentError,
          failedQuery: "assignments" as const,
          queueIssueIds: [],
        };
      }

      const helperIssueIdSet = new Set(helperIssueIds);
      helperPrimaryAssignments = (
        (allAssignmentData ?? []) as IssueAssignment[]
      ).filter((assignment) =>
        helperIssueIdSet.has(assignment.issue_id),
      );
    }

    const assignments = [
      ...selectedAssignments,
      ...helperPrimaryAssignments.filter(
        (helperAssignment) =>
          !selectedAssignments.some(
            (assignment) =>
              assignment.issue_id === helperAssignment.issue_id,
          ),
      ),
    ];
    const noticeIssueIds = notices
      .map((notice) => notice.issue_id)
      .filter((issueId): issueId is string => Boolean(issueId));
    const issueIds = [
      ...new Set([
        ...assignments.map((assignment) => assignment.issue_id),
        ...helperIssueIds,
        ...noticeIssueIds,
      ]),
    ];
    const queueIssueIds = [
      ...new Set([
        ...selectedAssignments.map(
          (assignment) => assignment.issue_id,
        ),
        ...helperIssueIds,
      ]),
    ];

    if (issueIds.length === 0) {
      return {
        assignments,
        data: [],
        error: null,
        failedQuery: null,
        queueIssueIds,
      };
    }

    const { data, error } = await supabase
      .from("issues")
      .select(
        "id, channel_number, cue_value, issue_type, position_name, effect_name, status, session_id, created_at, updated_at",
      )
      .eq("show_id", activeShow.id)
      .eq("session_id", activeSession.id)
      .in("id", issueIds)
      .order("created_at", { ascending: false });

    return {
      assignments,
      data,
      error,
      failedQuery: error ? ("issues" as const) : null,
      queueIssueIds,
    };
  }, [
    activeSession,
    activeShow,
    notices,
    selectedTechnician,
    supabase,
  ]);

  useEffect(() => {
    if (
      !activeShow ||
      !activeSession ||
      activeSession.show_id !== activeShow.id
    ) {
      sessionStatusSnapshot.current = null;
      return;
    }

    let isCancelled = false;

    const checkSessionStatus = async () => {
      const { data, error } = await supabase
        .from("continuity_sessions")
        .select("id, status, ended_at")
        .eq("id", activeSession.id)
        .eq("show_id", activeShow.id)
        .maybeSingle();

      if (isCancelled || error || !data) {
        return;
      }

      const sessionRecord = data as SessionStatusRecord;
      markConnected();
      const previousStatus = sessionStatusSnapshot.current;
      sessionStatusSnapshot.current = sessionRecord.status;

      if (
        previousStatus === "active" &&
        sessionRecord.status === "ended" &&
        !shownEndedSessionIds.current.has(sessionRecord.id)
      ) {
        shownEndedSessionIds.current.add(sessionRecord.id);
        playWarning();
        vibrate([120, 60, 120]);
        setSessionEndedPopup({
          entries: [],
          error: null,
          isLoading: true,
          sessionId: sessionRecord.id,
        });

        const { entries, error: scoreboardError } =
          await loadSessionScoreboard(sessionRecord.id);

        if (isCancelled) {
          return;
        }

        setSessionEndedPopup({
          entries,
          error: scoreboardError,
          isLoading: false,
          sessionId: sessionRecord.id,
        });
      }
    };

    void checkSessionStatus();
    const intervalId = window.setInterval(() => {
      void checkSessionStatus();
    }, 5000);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeSession, activeShow, loadSessionScoreboard, markConnected, supabase]);

  const refreshLatestNotes = useCallback(
    async (issueRecords: TechnicianIssue[]) => {
      const issueIds = issueRecords.map((issue) => issue.id);

      if (issueIds.length === 0) {
        setLatestIssueNotes({});
        setLatestNotFixedNotes({});
        setLatestStatusUpdateTimes({});
        setLatestPreviousStatuses({});
        setHistoryReadWarning(null);
        updateQueryDiagnostic("status history", {
          status: "loaded",
          error: null,
        });
        return;
      }

      updateQueryDiagnostic("status history", {
        status: "loading",
        error: null,
      });

      let data;
      let error;

      try {
        const result = await supabase
          .from("issue_status_history")
          .select("issue_id, new_status, note, old_status, created_at")
          .in("issue_id", issueIds)
          .order("created_at", { ascending: false });
        data = result.data;
        error = result.error;
      } catch (queryError) {
        error = {
          message:
            queryError instanceof Error
              ? queryError.message
              : "Unknown status history fetch failure.",
        };
      }

      if (error) {
        setLatestIssueNotes({});
        setLatestNotFixedNotes({});
        setLatestStatusUpdateTimes({});
        setLatestPreviousStatuses({});
        setHistoryReadWarning(getHistoryReadFailureMessage(error.message));
        updateQueryDiagnostic("status history", {
          status: "error",
          error: error.message,
        });
        return;
      }

      const notes: Record<string, string> = {};
      const notFixedNotes: Record<string, string> = {};
      const statusUpdateTimes: Record<string, string> = {};
      const previousStatuses: Record<string, string> = {};
      const latestEventsSeen = new Set<string>();
      const currentStatuses = new Map(
        issueRecords.map((issue) => [issue.id, issue.status]),
      );

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
          history.new_status === currentStatuses.get(history.issue_id) &&
          !statusUpdateTimes[history.issue_id]
        ) {
          if (history.created_at) {
            statusUpdateTimes[history.issue_id] = history.created_at;
          }
          if (history.old_status) {
            previousStatuses[history.issue_id] = history.old_status;
          }
        }
      }

      setLatestIssueNotes(notes);
      setLatestNotFixedNotes(notFixedNotes);
      setLatestStatusUpdateTimes(statusUpdateTimes);
      setLatestPreviousStatuses(previousStatuses);
      setHistoryReadWarning(null);
      updateQueryDiagnostic("status history", {
        status: "loaded",
        error: null,
      });
    },
    [supabase, updateQueryDiagnostic],
  );

  const refreshIssues = useCallback(async () => {
    updateQueryDiagnostic("issues", {
      status: "loading",
      error: null,
    });

    try {
      updateQueryDiagnostic("assignments", {
        status: "loading",
        error: null,
      });
      const {
        assignments,
        data,
        error,
        failedQuery,
        queueIssueIds,
      } = await fetchIssues();

      if (error) {
        const queryName = failedQuery ?? "issues";
        setFeedback({
          type: "error",
          message: `Could not load technician ${queryName}: ${error.message}`,
        });
        updateQueryDiagnostic(queryName, {
          status: "error",
          error: error.message,
        });
        return;
      }

      setActiveAssignments(assignments);
      setActiveQueueIssueIds(new Set(queueIssueIds));
      markConnected();
      updateQueryDiagnostic("assignments", {
        status: "loaded",
        error: null,
      });
      const nextIssues = (data ?? []) as TechnicianIssue[];
      const nextAlertSnapshot = new Map(
        nextIssues.map((issue) => [issue.id, issue.status]),
      );
      const previousAlertSnapshot = issueAlertSnapshot.current;

      if (previousAlertSnapshot) {
        let hasNormalAlert = false;
        let hasUrgentAlert = false;

        nextIssues.forEach((issue) => {
          const previousStatus = previousAlertSnapshot.get(issue.id);

          if (!previousStatus) {
            hasNormalAlert = true;
            return;
          }

          if (
            issue.status === "verification_failed" ||
            (awaitingDirectorStatuses.has(previousStatus) &&
              !awaitingDirectorStatuses.has(issue.status))
          ) {
            hasUrgentAlert = true;
          }
        });

        if (hasUrgentAlert) {
          playWarning();
          vibrate([120, 60, 120]);
        } else if (hasNormalAlert) {
          playWarning();
          vibrate([80]);
        }
      }

      issueAlertSnapshot.current = nextAlertSnapshot;
      setIssues(nextIssues);
      setFeedback((current) =>
        current?.type === "error" ? null : current,
      );
      updateQueryDiagnostic("issues", {
        status: "loaded",
        error: null,
      });
      await refreshLatestNotes(nextIssues);
    } catch (queryError) {
      const errorMessage =
        queryError instanceof Error
          ? queryError.message
          : "Unknown issues fetch failure.";
      setFeedback({
        type: "error",
        message: `Could not load technician issues: ${errorMessage}`,
      });
      updateQueryDiagnostic("assignments", {
        status: "error",
        error: errorMessage,
      });
      updateQueryDiagnostic("issues", {
        status: "error",
        error: errorMessage,
      });
      setConnectionStatus("disconnected");
    }
  }, [fetchIssues, markConnected, refreshLatestNotes, updateQueryDiagnostic]);

  useEffect(() => {
    const loadIssues = async () => {
      try {
        await refreshIssues();
      } finally {
        setIsLoading(false);
      }
    };

    void loadIssues();
  }, [refreshIssues]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshIssues();
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [refreshIssues]);

  const assignmentTimes = useMemo(
    () =>
      Object.fromEntries(
        activeAssignments.map((assignment) => [
          assignment.issue_id,
          assignment.assigned_at,
        ]),
      ) as Record<string, string>,
    [activeAssignments],
  );

  const assignedIssues = useMemo(
    () =>
      issues.filter((issue) => activeQueueIssueIds.has(issue.id)),
    [activeQueueIssueIds, issues],
  );

  const isDirectorReturnedRetrievingParts = useCallback(
    (issue: TechnicianIssue) => {
      const assignment = activeAssignments.find(
        (currentAssignment) =>
          currentAssignment.issue_id === issue.id,
      );

      return (
        issue.status === "retrieving_parts" &&
        !assignment?.acknowledged_at &&
        latestPreviousStatuses[issue.id] ===
          "director_assistance_requested"
      );
    },
    [activeAssignments, latestPreviousStatuses],
  );

  const workingIssues = useMemo(
    () =>
      assignedIssues
        .filter(
          (issue) =>
            workingStatuses.has(issue.status) &&
            !isDirectorReturnedRetrievingParts(issue),
        )
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
    [
      assignedIssues,
      isDirectorReturnedRetrievingParts,
      latestStatusUpdateTimes,
    ],
  );

  const fieldResponseIssues = useMemo(
    () =>
      assignedIssues
        .filter(
          (issue) =>
            activeStatuses.has(issue.status) &&
            (!workingStatuses.has(issue.status) ||
              isDirectorReturnedRetrievingParts(issue)),
        )
        .sort((a, b) => {
          const aIsQueued = a.status === "assigned";
          const bIsQueued = b.status === "assigned";

          if (aIsQueued !== bIsQueued) {
            return aIsQueued ? -1 : 1;
          }

          const aAssignmentTime = assignmentTimes[a.id];
          const bAssignmentTime = assignmentTimes[b.id];
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
      assignedIssues,
      assignmentTimes,
      isDirectorReturnedRetrievingParts,
      latestStatusUpdateTimes,
    ],
  );

  const mobileAssignedIssues = useMemo(
    () =>
      fieldResponseIssues.filter(
        (issue) => !awaitingDirectorStatuses.has(issue.status),
      ),
    [fieldResponseIssues],
  );

  const awaitingDirectorIssues = useMemo(
    () =>
      fieldResponseIssues.filter((issue) =>
        awaitingDirectorStatuses.has(issue.status),
      ),
    [fieldResponseIssues],
  );

  const resolutionNotices = useMemo(() => {
    const resolutionIssueIds = new Set(
      notices
        .filter((notice) =>
          resolutionNoticeTypes.has(notice.notice_type),
        )
        .map((notice) => notice.issue_id)
        .filter((issueId): issueId is string => Boolean(issueId)),
    );

    return issues.filter(
      (issue) =>
        resolutionStatuses.has(issue.status) &&
        resolutionIssueIds.has(issue.id),
    );
  }, [issues, notices]);

  useEffect(() => {
    if (isLoading || hasSelectedMobileSection.current) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (hasSelectedMobileSection.current) {
        return;
      }

      const initialSection: MobileSection =
        workingIssues.length > 0
          ? "working"
          : mobileAssignedIssues.length > 0
            ? "assigned"
            : awaitingDirectorIssues.length > 0
              ? "awaiting-director"
              : resolutionNotices.length > 0
                ? "resolutions"
                : "assigned";

      hasSelectedMobileSection.current = true;
      setMobileSection(initialSection);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [
    awaitingDirectorIssues.length,
    isLoading,
    mobileAssignedIssues.length,
    resolutionNotices.length,
    workingIssues.length,
  ]);

  const selectMobileSection = (section: MobileSection) => {
    hasSelectedMobileSection.current = true;
    setMobileSection(section);
  };

  const clearActiveShow = () => {
    setActiveContinuitySession(null);
    setActiveShow(null);
    setIsMobileMenuOpen(false);
    router.push("/shows");
  };

  const outgoingHandoffNotices = useMemo(
    () =>
      notices.flatMap((notice) => {
        if (
          notice.notice_type !== "handoff_outgoing" &&
          notice.notice_type !== "reassigned"
        ) {
          return [];
        }

        const payload = parseHandoffNoticePayload(notice.message);
        return payload
          ? [{
              ...payload,
              handoffNote: payload.handoffNote ?? null,
              id: notice.id,
              reassignedAt: notice.created_at,
            }]
          : [];
      }),
    [notices],
  );

  const incomingHandoffNotices = useMemo(
    () =>
      notices.flatMap((notice) => {
        if (
          notice.notice_type !== "handoff_incoming" &&
          notice.notice_type !== "handoff"
        ) {
          return [];
        }

        const payload = parseHandoffNoticePayload(notice.message);
        return payload
          ? [{
              ...payload,
              handoffNote: payload.handoffNote ?? null,
              id: notice.id,
              reassignedAt: notice.created_at,
            }]
          : [];
      }),
    [notices],
  );

  useEffect(() => {
    if (noticesLoading) {
      return;
    }

    const nextSnapshot = new Set(notices.map((notice) => notice.id));
    const previousSnapshot = noticeAlertSnapshot.current;
    const newNotices = previousSnapshot
      ? notices.filter((notice) => !previousSnapshot.has(notice.id))
      : [];

    if (newNotices.length > 0) {
      playWarning();
      vibrate([120, 60, 120]);
      void refreshIssues();

      newNotices
        .filter(isDirectorReturnNotice)
        .forEach((notice) => {
          if (
            !handledDirectorReturnNoticeIds.current.has(notice.id)
          ) {
            pendingDirectorReturnNoticeIds.current.add(notice.id);
          }
        });
    }

    noticeAlertSnapshot.current = nextSnapshot;
  }, [notices, noticesLoading, refreshIssues]);

  useEffect(() => {
    if (directorReturnPopup) {
      return;
    }

    const pendingNotice = notices.find(
      (notice) =>
        pendingDirectorReturnNoticeIds.current.has(notice.id) &&
        !handledDirectorReturnNoticeIds.current.has(notice.id) &&
        isDirectorReturnNotice(notice),
    );

    if (!pendingNotice?.issue_id) {
      return;
    }

    const matchingIssue = issues.find(
      (issue) => issue.id === pendingNotice.issue_id,
    );

    if (!matchingIssue) {
      return;
    }

    pendingDirectorReturnNoticeIds.current.delete(pendingNotice.id);
    handledDirectorReturnNoticeIds.current.add(pendingNotice.id);
    setDirectorReturnPopup({
      issue: matchingIssue,
      note: pendingNotice.message?.trim() || null,
      noticeId: pendingNotice.id,
      noticeType: pendingNotice.notice_type,
      previousStatus: latestPreviousStatuses[matchingIssue.id] ?? null,
      statusLabel: formatIssueLabel(matchingIssue.status),
    });
  }, [
    directorReturnPopup,
    issues,
    latestPreviousStatuses,
    notices,
  ]);

  useEffect(() => {
    const updateId = window.setTimeout(() => {
      updateQueryDiagnostic("resolution notices", {
        status: noticesError ? "error" : "loaded",
        error: noticesError,
      });
      if (noticesError) {
        setConnectionStatus("disconnected");
        setFeedback({
          type: "error",
          message: `Could not load technician notices: ${noticesError}`,
        });
      } else if (!noticesLoading) {
        markConnected();
      }
    }, 0);

    return () => window.clearTimeout(updateId);
  }, [markConnected, noticesError, noticesLoading, updateQueryDiagnostic]);

  const sendHeartbeat = useCallback(async () => {
    if (!activeShow || !activeSession) {
      setConnectionStatus("disconnected");
      return;
    }

    if (activeSession.show_id !== activeShow.id) {
      setConnectionStatus("disconnected");
      return;
    }

    const { error } = await recordTechnicianHeartbeat({
      sessionId: activeSession.id,
      showId: activeShow.id,
      technicianId: selectedTechnician,
    });

    if (error) {
      setConnectionStatus("disconnected");
    } else {
      markConnected();
    }
  }, [activeSession, activeShow, markConnected, selectedTechnician]);

  useEffect(() => {
    if (!activeShow || !activeSession) {
      return;
    }

    const initialHeartbeatId = window.setTimeout(() => {
      void sendHeartbeat();
    }, 0);
    const intervalId = window.setInterval(() => {
      void sendHeartbeat();
    }, 15000);

    return () => {
      window.clearTimeout(initialHeartbeatId);
      window.clearInterval(intervalId);
    };
  }, [activeSession, activeShow, sendHeartbeat]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (Date.now() - lastSuccessfulConnectionAt.current > 30000) {
        setConnectionStatus("disconnected");
      }
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, []);

  const acknowledgeActiveWork = async (issueId: string) => {
    const acknowledgedAt = new Date().toISOString();
    const { error } = await setActiveIssueAssignmentAcknowledgedAt(
      issueId,
      acknowledgedAt,
    );

    if (error) {
      setFeedback({
        type: "error",
        message: `Could not start work: ${error.message}`,
      });
      return false;
    }

    setActiveAssignments((currentAssignments) =>
      currentAssignments.map((assignment) =>
        assignment.issue_id === issueId
          ? { ...assignment, acknowledged_at: acknowledgedAt }
          : assignment,
      ),
    );
    return true;
  };

  const updateIssueStatus = async (
    issue: TechnicianIssue,
    status: string,
    note: string | null = null,
    onSuccess?: () => void,
  ) => {
    if (!activeShow) {
      return;
    }

    setUpdatingIssueId(issue.id);
    setFeedback(null);
    setHistoryWarning(null);

    if (
      (status === "in_progress" ||
        (status === "retrieving_parts" &&
          issue.status !== "retrieving_parts")) &&
      !(await acknowledgeActiveWork(issue.id))
    ) {
      setUpdatingIssueId(null);
      return;
    }

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
      if (!historyError && actionConfirmationMessages[status]) {
        setActionConfirmation(actionConfirmationMessages[status]);
      }
      if (!historyError) {
        playSuccess();
      }
      setNoteIssueId(null);
      setNoteStatus(null);
      setRequiredNote("");
      setNoteValidation(null);
      onSuccess?.();
    }

    setUpdatingIssueId(null);
  };

  const startWorking = async (
    issue: TechnicianIssue,
    isMobileCard: boolean,
  ) => {
    if (issue.status !== "retrieving_parts") {
      await updateIssueStatus(
        issue,
        "in_progress",
        null,
        isMobileCard
          ? () => showMobileWorkingIssue(issue.id)
          : undefined,
      );
      return;
    }

    setUpdatingIssueId(issue.id);
    setFeedback(null);

    if (await acknowledgeActiveWork(issue.id)) {
      playSuccess();
      setFeedback({
        type: "success",
        message: "Work started. Issue remains Retrieving Parts.",
      });

      if (isMobileCard) {
        showMobileWorkingIssue(issue.id);
      }
    }

    setUpdatingIssueId(null);
  };

  const acknowledgeHandoff = async (handoff: SharedHandoff) => {
    const note = handoffNotes[handoff.id]?.trim() ?? "";
    const updatedPayload: HandoffNoticePayload = {
      channelNumber: handoff.channelNumber,
      cueValue: handoff.cueValue,
      effectName: handoff.effectName,
      fromTechnician: handoff.fromTechnician,
      handoffNote: note || null,
      issueId: handoff.issueId,
      issueType: handoff.issueType,
      positionName: handoff.positionName,
      previousStatus: handoff.previousStatus,
      toTechnician: handoff.toTechnician,
    };
    const { error: noticeError } = await acknowledgeTechnicianNotice(
      handoff.id,
      JSON.stringify(updatedPayload),
    );
    if (noticeError) {
      setFeedback({
        type: "error",
        message: `Could not acknowledge handoff: ${noticeError.message}`,
      });
      return;
    }
    const { error: incomingNoticeError } =
      await updateIncomingHandoffNotice({
        issueId: handoff.issueId,
        message: JSON.stringify(updatedPayload),
        technicianId: handoff.toTechnician,
      });
    if (incomingNoticeError) {
      setFeedback({
        type: "error",
        message: `Handoff acknowledged, but note delivery failed: ${incomingNoticeError.message}`,
      });
    }
    await refreshNotices();
    setHandoffNotes((currentNotes) => {
      const nextNotes = { ...currentNotes };
      delete nextNotes[handoff.id];
      return nextNotes;
    });
    setFeedback({
      type: "success",
      message: "Handoff acknowledged.",
    });

    const originalTech = getTemporaryTechnicianLabel(
      handoff.fromTechnician,
    );
    const newTech = getTemporaryTechnicianLabel(handoff.toTechnician);
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

  const acceptHandoff = async (handoff: SharedHandoff) => {
    const { error: noticeError } =
      await acknowledgeTechnicianNotice(handoff.id);
    if (noticeError) {
      setFeedback({
        type: "error",
        message: `Could not accept handoff: ${noticeError.message}`,
      });
      return;
    }
    await refreshNotices();
    setFeedback({
      type: "success",
      message: "Handoff accepted.",
    });

    const originalTech = getTemporaryTechnicianLabel(
      handoff.fromTechnician,
    );
    const receivingTech = getTemporaryTechnicianLabel(handoff.toTechnician);
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

  const getMobileSectionForIssue = (issue: TechnicianIssue) => {
    if (
      resolutionStatuses.has(issue.status) &&
      resolutionNotices.some((noticeIssue) => noticeIssue.id === issue.id)
    ) {
      return "resolutions" satisfies MobileSection;
    }

    if (workingIssues.some((workingIssue) => workingIssue.id === issue.id)) {
      return "working" satisfies MobileSection;
    }

    if (
      awaitingDirectorIssues.some(
        (awaitingIssue) => awaitingIssue.id === issue.id,
      )
    ) {
      return "awaiting-director" satisfies MobileSection;
    }

    return "assigned" satisfies MobileSection;
  };

  const showMobileIssue = (issue: TechnicianIssue) => {
    hasSelectedMobileSection.current = true;
    setMobileSection(getMobileSectionForIssue(issue));

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document
          .querySelector(`[data-mobile-issue-id="${issue.id}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  };

  const showMobileWorkingIssue = (issueId: string) => {
    hasSelectedMobileSection.current = true;
    setMobileSection("working");

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document
          .querySelector(`[data-mobile-issue-id="${issueId}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  };

  const renderIssueCard = (
    issue: TechnicianIssue,
    isMobileCard = false,
  ) => {
    const isUpdating = updatingIssueId === issue.id;
    const notFixedNote = latestNotFixedNotes[issue.id];
    const activeAssignment = activeAssignments.find(
      (assignment) => assignment.issue_id === issue.id,
    );
    const isActivelyWorking =
      issue.status === "in_progress" ||
      (issue.status === "retrieving_parts" &&
        Boolean(activeAssignment?.acknowledged_at));

    return (
      <article
        key={issue.id}
        className="rounded-lg border border-white/10 bg-[#070b18] p-4 md:p-5"
        data-mobile-issue-id={isMobileCard ? issue.id : undefined}
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
              Position:{" "}
              <strong className="font-bold text-[#4ade80]">
                {issue.position_name ?? "None"}
              </strong>
            </p>
            {issue.position_name ? (
              <button
                className="flex min-h-11 w-fit touch-manipulation items-center text-sm font-semibold text-[#fbbf24] transition active:text-[#fde68a] md:min-h-0 md:hover:text-[#fde68a]"
                onClick={() => {
                  updateQueryDiagnostic("map assist data", {
                    status: "loading",
                    error: null,
                  });
                  setMapAssistIssue(issue);
                }}
                type="button"
              >
                Show on Map
              </button>
            ) : null}
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
              className="flex min-h-11 touch-manipulation items-center text-sm font-semibold text-[#c4b5fd] active:text-white md:min-h-0 md:hover:text-white"
            >
              View Issue
            </Link>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-4">
          {STATUS_ACTIONS.filter((action) => {
            if (isActivelyWorking) {
              return action.status !== "in_progress";
            }

            return action.status === "in_progress";
          }).map((action) => (
            <button
              key={action.status}
              type="button"
              disabled={isUpdating}
              onClick={() => {
                playUiClick();
                if (
                  action.status === "retrieving_parts" ||
                  action.status === "director_assistance_requested" ||
                  action.status === "additional_technician_requested"
                ) {
                  setNoteIssueId(issue.id);
                  setNoteStatus(action.status);
                  setRequiredNote("");
                  setNoteValidation(null);
                  setFeedback(null);
                  setHistoryWarning(null);
                  return;
                }

                if (action.status === "in_progress") {
                  void startWorking(issue, isMobileCard);
                  return;
                }

                void updateIssueStatus(
                  issue,
                  action.status,
                  null,
                );
              }}
              className={`min-h-12 flex-1 basis-[calc(50%-0.25rem)] touch-manipulation rounded-md border px-3 py-2 text-sm font-semibold transition active:brightness-125 disabled:cursor-wait disabled:opacity-50 md:min-h-0 md:flex-none md:basis-auto md:text-xs md:hover:brightness-125 ${action.className}`}
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
                : noteStatus === "additional_technician_requested"
                  ? "Additional Technician Request Note"
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
                    : noteStatus === "additional_technician_requested"
                      ? "Required: explain why another technician is needed"
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
                className="min-h-12 flex-1 touch-manipulation rounded-md bg-[#b45309] px-3 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 md:min-h-0 md:flex-none md:text-xs"
                disabled={isUpdating}
                onClick={() => {
                  if (!requiredNote.trim()) {
                    setNoteValidation(
                      noteStatus === "additional_technician_requested"
                        ? "Add a note before requesting another technician."
                        : "A short note is required before changing this status.",
                    );
                    return;
                  }

                  if (noteStatus) {
                    playUiClick();
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
                className="min-h-12 touch-manipulation rounded-md border border-white/15 px-3 py-2 text-sm font-semibold text-[#cbd5e1] md:min-h-0 md:text-xs"
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

  const renderResolutionNotice = (issue: TechnicianIssue) => (
    <article
      className="rounded-lg border border-white/10 bg-[#070b18] p-4"
      data-mobile-issue-id={issue.id}
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
          className="min-h-12 touch-manipulation rounded-md border border-[#8b5cf6]/45 bg-[#1b1235] px-4 py-3 text-sm font-semibold text-[#d8c8ff] transition active:border-[#a78bfa] md:min-h-0 md:px-3 md:py-2 md:text-xs md:hover:border-[#a78bfa]"
          onClick={() => {
            const matchingNotices = notices.filter(
              (notice) =>
                resolutionNoticeTypes.has(notice.notice_type) &&
                notice.issue_id === issue.id,
            );
            void Promise.all(
              matchingNotices.map((notice) =>
                acknowledgeTechnicianNotice(notice.id),
              ),
            ).then(async (results) => {
              const noticeError = results.find(
                (result) => result.error,
              )?.error;
              if (noticeError) {
                setFeedback({
                  type: "error",
                  message: `Could not acknowledge resolution: ${noticeError.message}`,
                });
                return;
              }
              await refreshNotices();
            });
          }}
          type="button"
        >
          Acknowledge & Remove
        </button>
      </div>
    </article>
  );

  const directorReturnContent = directorReturnPopup
    ? getDirectorReturnPopupContent(directorReturnPopup)
    : null;
  const closeScoreboard = () => {
    setSessionEndedPopup(null);
    setActiveContinuitySession(null);
    setActiveShow(null);
    router.push("/shows");
  };
  const refreshTechnicianConsole = async () => {
    setIsManuallyRefreshing(true);
    try {
      await Promise.all([refreshIssues(), refreshNotices(), sendHeartbeat()]);
    } finally {
      setIsManuallyRefreshing(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 pb-28 pt-0 md:gap-6 md:px-8 md:py-6 lg:py-8">
      <header className="sticky top-0 z-40 -mx-3 flex min-h-16 items-center justify-between gap-3 border-b border-white/10 bg-[#070b18]/95 px-4 py-2 shadow-xl shadow-black/30 backdrop-blur md:hidden">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">
            {activeShow?.name ?? "No active show"}
          </p>
          <p className="truncate text-xs text-[#94a3b8]">
            {activeSession &&
            activeSession.show_id === activeShow?.id
              ? activeSession.name
              : "No active session"}
            {" · "}
            {getTemporaryTechnicianLabel(selectedTechnician)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            aria-label={
              connectionStatus === "connected"
                ? "Connected"
                : "Not connected"
            }
            className={`h-2.5 w-2.5 rounded-full ${
              connectionStatus === "connected"
                ? "bg-[#22c55e] shadow-[0_0_8px_rgba(34,197,94,0.8)]"
                : "bg-[#ef4444] shadow-[0_0_8px_rgba(239,68,68,0.75)]"
            }`}
            role="status"
          />
          <button
            aria-label="Refresh technician console"
            className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-lg border border-white/15 bg-[#0d1324] text-white active:bg-[#17102c] disabled:opacity-50"
            disabled={isManuallyRefreshing}
            onClick={() => void refreshTechnicianConsole()}
            type="button"
          >
            <svg
              aria-hidden="true"
              className={`h-5 w-5 ${isManuallyRefreshing ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                d="M20 12a8 8 0 1 1-2.34-5.66M20 4v6h-6"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </svg>
          </button>
          <MobileTechnicianAlertToggle />
          <div className="relative">
          <button
            aria-expanded={isMobileMenuOpen}
            aria-label="Open technician menu"
            className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-lg border border-white/15 bg-[#0d1324] text-white active:bg-[#17102c]"
            onClick={() => setIsMobileMenuOpen((isOpen) => !isOpen)}
            type="button"
          >
            <svg
              aria-hidden="true"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                d="M4 7h16M4 12h16M4 17h16"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="2"
              />
            </svg>
          </button>
          {isMobileMenuOpen ? (
            <div className="absolute right-0 top-12 z-50 grid w-56 overflow-hidden rounded-lg border border-white/15 bg-[#0b1020] p-2 shadow-2xl shadow-black/60">
              <Link
                className="flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-[#dbe4ef] active:bg-white/10"
                href="/shows"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Shows
              </Link>
              <Link
                className="flex min-h-11 items-center rounded-md bg-[#17102c] px-3 text-sm font-semibold text-white"
                href="/technician"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Technician Console
              </Link>
              <button
                className="min-h-11 rounded-md px-3 text-left text-sm font-semibold text-[#fecaca] active:bg-[#2a0b13]"
                onClick={clearActiveShow}
                type="button"
              >
                Clear Active Show
              </button>
            </div>
          ) : null}
          </div>
        </div>
      </header>

      {activeShow && mapAssistIssue?.position_name ? (
        <TechnicianMapAssist
          onDataState={updateMapAssistDiagnostic}
          onClose={() => {
            setMapAssistIssue(null);
            updateQueryDiagnostic("map assist data", {
              status: "idle",
              error: null,
            });
          }}
          positionName={mapAssistIssue.position_name}
          showId={activeShow.id}
        />
      ) : null}
      <section className="hidden rounded-lg border border-white/10 bg-[#0b1020]/90 p-6 shadow-2xl shadow-black/25 md:block">
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

      <section className="rounded-lg border border-white/10 bg-[#0b1020]/90 p-3 shadow-xl shadow-black/20 md:hidden">
        <div className="flex items-center justify-between gap-3 px-1 pb-3">
          <div>
            <h1 className="text-lg font-semibold text-white">
              {mobileSection === "working"
                ? "I'm Working"
                : mobileSection === "awaiting-director"
                  ? "Awaiting Director"
                : mobileSection === "resolutions"
                  ? "Resolution Notices"
                  : "Assigned to Me"}
            </h1>
            <p className="mt-1 text-xs text-[#94a3b8]">
              {mobileSection === "working"
                ? "Issues currently in progress."
                : mobileSection === "awaiting-director"
                  ? "Issues waiting for Director action or verification."
                : mobileSection === "resolutions"
                  ? "Completed outcomes awaiting acknowledgement."
                  : "Assignments ready for your response."}
            </p>
          </div>
          <span className="rounded-md border border-white/10 bg-[#070b18] px-2.5 py-1 text-xs font-bold text-[#dbe4ef]">
            {mobileSection === "working"
              ? workingIssues.length
              : mobileSection === "awaiting-director"
                ? awaitingDirectorIssues.length
              : mobileSection === "resolutions"
                ? resolutionNotices.length
                : mobileAssignedIssues.length}
          </span>
        </div>

        {feedback ? (
          <p
            className={`mb-3 rounded-lg border p-3 text-sm font-semibold ${
              feedback.type === "success"
                ? "border-[#22c55e]/40 bg-[#082515] text-[#bbf7d0]"
                : "border-[#ef4444]/40 bg-[#2a0b13] text-[#fecaca]"
            }`}
          >
            {feedback.message}
          </p>
        ) : null}
        {historyWarning ? (
          <p className="mb-3 rounded-lg border border-[#f59e0b]/45 bg-[#2a1c06] p-3 text-sm font-semibold leading-6 text-[#fde68a]">
            {historyWarning}
          </p>
        ) : null}
        {mobileSection === "resolutions" && historyReadWarning ? (
          <p className="mb-3 rounded-lg border border-[#f59e0b]/45 bg-[#2a1c06] p-3 text-xs font-semibold leading-5 text-[#fde68a]">
            {historyReadWarning}
          </p>
        ) : null}

        <div className="grid gap-3">
          {isLoading ? (
            <p className="p-4 text-sm text-[#94a3b8]">
              Loading assigned issues...
            </p>
          ) : mobileSection === "working" ? (
            workingIssues.length > 0 ? (
              workingIssues.map((issue) => renderIssueCard(issue, true))
            ) : (
              <p className="rounded-lg border border-dashed border-white/15 bg-[#070b18] p-5 text-center text-sm text-[#94a3b8]">
                No issues currently being worked.
              </p>
            )
          ) : mobileSection === "awaiting-director" ? (
            awaitingDirectorIssues.length > 0 ? (
              awaitingDirectorIssues.map((issue) =>
                renderIssueCard(issue, true),
              )
            ) : (
              <p className="rounded-lg border border-dashed border-white/15 bg-[#070b18] p-5 text-center text-sm text-[#94a3b8]">
                No issues awaiting Director action.
              </p>
            )
          ) : mobileSection === "resolutions" ? (
            resolutionNotices.length > 0 ? (
              resolutionNotices.map(renderResolutionNotice)
            ) : (
              <p className="rounded-lg border border-dashed border-white/15 bg-[#070b18] p-5 text-center text-sm text-[#94a3b8]">
                No resolution notices.
              </p>
            )
          ) : mobileAssignedIssues.length > 0 ? (
            mobileAssignedIssues.map((issue) => renderIssueCard(issue, true))
          ) : (
            <p className="rounded-lg border border-dashed border-white/15 bg-[#070b18] p-5 text-center text-sm text-[#94a3b8]">
              No issues waiting for field response.
            </p>
          )}
        </div>
      </section>

      <section className="hidden rounded-lg border border-[#3b82f6]/25 bg-[#0b1020]/90 p-6 shadow-xl shadow-black/20 md:block">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">
              I&apos;m Working
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
              {!selectedTechnician.startsWith("tech_") ? (
                <option value={selectedTechnician}>
                  {getTemporaryTechnicianLabel(selectedTechnician)}
                </option>
              ) : null}
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
            workingIssues.map((issue) => renderIssueCard(issue))
          )}
        </div>
      </section>

      <section className="hidden rounded-lg border border-white/10 bg-[#0b1020]/90 p-6 shadow-xl shadow-black/20 md:block">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-white">
              Assigned to Me
            </h2>
            <p className="mt-2 text-sm text-[#94a3b8]">
              Assignments and field responses ordered for the
              technician&apos;s next action.
            </p>
          </div>
          <span className="rounded-md border border-white/10 bg-[#070b18] px-2 py-1 text-xs font-bold text-[#cbd5e1]">
            {mobileAssignedIssues.length}
          </span>
        </div>

        <div className="mt-5 grid gap-4">
          {isLoading ? (
            <p className="text-sm text-[#94a3b8]">
              Loading assigned issues...
            </p>
          ) : mobileAssignedIssues.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/15 bg-[#070b18] p-6 text-center">
              <p className="font-semibold text-[#dbe4ef]">
                No issues assigned to this technician.
              </p>
              <p className="mt-2 text-sm text-[#94a3b8]">
                New assignments will appear here until work begins.
              </p>
            </div>
          ) : (
            mobileAssignedIssues.map((issue) => renderIssueCard(issue))
          )}
        </div>
      </section>

      <section className="hidden rounded-lg border border-[#f59e0b]/25 bg-[#0b1020]/90 p-6 shadow-xl shadow-black/20 md:block">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-white">
              Awaiting Director
            </h2>
            <p className="mt-2 text-sm text-[#94a3b8]">
              Technician action is complete and Director follow-up is pending.
            </p>
          </div>
          <span className="rounded-md border border-white/10 bg-[#070b18] px-2 py-1 text-xs font-bold text-[#cbd5e1]">
            {awaitingDirectorIssues.length}
          </span>
        </div>

        <div className="mt-5 grid gap-4">
          {isLoading ? (
            <p className="text-sm text-[#94a3b8]">
              Loading Director follow-up issues...
            </p>
          ) : awaitingDirectorIssues.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/15 bg-[#070b18] p-6 text-center">
              <p className="font-semibold text-[#dbe4ef]">
                No issues awaiting Director action.
              </p>
            </div>
          ) : (
            awaitingDirectorIssues.map((issue) => renderIssueCard(issue))
          )}
        </div>
      </section>

      <section className="hidden rounded-lg border border-white/10 bg-[#0b1020]/90 p-5 shadow-xl shadow-black/20 md:block">
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
            resolutionNotices.map(renderResolutionNotice)
          )}
        </div>
      </section>

      <nav
        aria-label="Technician queue sections"
        className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-4 border-t border-white/10 bg-[#070b18]/98 px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_30px_rgba(0,0,0,0.45)] backdrop-blur md:hidden"
      >
        {(
          [
            {
              id: "assigned" as const,
              label: "Assigned",
              count: mobileAssignedIssues.length,
              icon: (
                <path
                  d="M7 5h10M7 9h10M7 13h6M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                />
              ),
            },
            {
              id: "working" as const,
              label: "Working",
              count: workingIssues.length,
              icon: (
                <path
                  d="m14.7 6.3 3-3a4 4 0 0 1-5 5l-7.6 7.6a2 2 0 1 0 2.8 2.8l7.6-7.6a4 4 0 0 1 5-5l-3 3-2.8-2.8Z"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                />
              ),
            },
            {
              id: "awaiting-director" as const,
              label: "Awaiting Director",
              count: awaitingDirectorIssues.length,
              icon: (
                <path
                  d="M12 7v5l3 2M5 3v4H1M19 21v-4h4M4.9 7A9 9 0 0 1 20 5.5M19.1 17A9 9 0 0 1 4 18.5"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                />
              ),
            },
            {
              id: "resolutions" as const,
              label: "Resolution Notices",
              count: resolutionNotices.length,
              icon: (
                <path
                  d="M5 12.5 9.2 17 19 7M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                />
              ),
            },
          ] satisfies {
            id: MobileSection;
            label: string;
            count: number;
            icon: React.ReactNode;
          }[]
        ).map((item) => {
          const isActive = mobileSection === item.id;
          const needsAttention = item.count > 0 && !isActive;

          return (
            <button
              aria-current={isActive ? "page" : undefined}
              className={`relative flex min-h-16 touch-manipulation flex-col items-center justify-center gap-1 rounded-lg px-0.5 text-[10px] font-semibold leading-tight transition ${
                isActive
                  ? "bg-[#4c00a4]/35 text-white shadow-inner shadow-[#8b5cf6]/20"
                  : "text-[#94a3b8] active:bg-white/10"
              } ${needsAttention ? "motion-safe:animate-pulse text-[#d8c8ff]" : ""}`}
              key={item.id}
              onClick={() => selectMobileSection(item.id)}
              type="button"
            >
              <span className="relative">
                <svg
                  aria-hidden="true"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  {item.icon}
                </svg>
                {item.count > 0 ? (
                  <span
                    className={`absolute -right-3 -top-2 flex min-h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                      isActive
                        ? "bg-[#a78bfa] text-[#130a2b]"
                        : "bg-[#7c3aed] text-white"
                    }`}
                  >
                    {item.count}
                  </span>
                ) : null}
              </span>
              <span className="max-w-full text-center">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {directorReturnPopup && directorReturnContent ? (
        <div
          aria-labelledby="technician-director-return-title"
          aria-modal="true"
          className="fixed inset-0 z-[72] flex items-center justify-center bg-black/82 p-5 backdrop-blur-sm md:hidden"
          role="dialog"
        >
          <section className="w-full max-w-md rounded-xl border border-[#f59e0b]/45 bg-[#0b1020] p-6 shadow-2xl shadow-black/60">
            <p
              className="text-sm font-bold uppercase tracking-[0.16em] text-[#fde68a]"
              id="technician-director-return-title"
            >
              Director Update
            </p>
            <p className="mt-4 text-2xl font-extrabold leading-8 text-white">
              {directorReturnContent.headline}
            </p>
            {directorReturnContent.subtext ? (
              <p className="mt-3 text-base font-semibold leading-7 text-[#dbe4ef]">
                {directorReturnContent.subtext}
              </p>
            ) : null}
            {directorReturnContent.note ? (
              <div className="mt-4 rounded-lg border border-[#f59e0b]/35 bg-[#2a1c06]/70 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#fde68a]">
                  Director Note
                </p>
                <p className="mt-2 text-base font-semibold leading-7 text-white">
                  {directorReturnContent.note}
                </p>
              </div>
            ) : null}
            <p className="mt-4 text-base leading-7 text-[#dbe4ef]">
              Issue CH{" "}
              <strong className={ISSUE_IDENTIFIER_VALUE_CLASS_NAME}>
                {directorReturnPopup.issue.channel_number}
              </strong>
              <span className="text-[#64748b]"> | </span>
              Cue(s){" "}
              <strong className={ISSUE_IDENTIFIER_VALUE_CLASS_NAME}>
                {directorReturnPopup.issue.cue_value}
              </strong>
            </p>
            {directorReturnPopup.issue.position_name ? (
              <p className="mt-2 text-base leading-7 text-[#dbe4ef]">
                Location:{" "}
                <strong className="font-bold text-[#4ade80]">
                  {directorReturnPopup.issue.position_name}
                </strong>
              </p>
            ) : null}
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                autoFocus
                className="min-h-14 touch-manipulation rounded-lg bg-[#6d28d9] px-5 py-3 text-lg font-bold text-white transition active:bg-[#7c3aed]"
                onClick={() => {
                  showMobileIssue(directorReturnPopup.issue);
                  setDirectorReturnPopup(null);
                }}
                type="button"
              >
                Go to Issue
              </button>
              <button
                className="min-h-14 touch-manipulation rounded-lg border border-white/15 bg-[#111827] px-5 py-3 text-lg font-bold text-[#dbe4ef] transition active:bg-white/10"
                onClick={() => {
                  handledDirectorReturnNoticeIds.current.add(
                    directorReturnPopup.noticeId,
                  );
                  setDirectorReturnPopup(null);
                }}
                type="button"
              >
                Dismiss
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {sessionEndedPopup ? (
        <div
          aria-labelledby="technician-scoreboard-title"
          aria-modal="true"
          className="fixed inset-0 z-[74] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm md:hidden"
          role="dialog"
        >
          <section className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[#8b5cf6]/45 bg-[#0b1020] shadow-2xl shadow-black/70">
            <div className="border-b border-white/10 p-5">
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#a78bfa]">
                Session Complete
              </p>
              <h2
                className="mt-3 text-2xl font-extrabold leading-8 text-white"
                id="technician-scoreboard-title"
              >
                The Director has ended this continuity session.
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#cbd5e1]">
                Here&apos;s the post-session Tech Scoreboard.
              </p>
            </div>

            <div className="grid gap-3 overflow-y-auto p-4">
              {sessionEndedPopup.isLoading ? (
                <p className="rounded-lg border border-dashed border-white/15 bg-[#070b18] p-5 text-center text-sm font-semibold text-[#94a3b8]">
                  Calculating scoreboard...
                </p>
              ) : sessionEndedPopup.error ? (
                <p className="rounded-lg border border-[#f59e0b]/45 bg-[#2a1c06] p-4 text-sm font-semibold leading-6 text-[#fde68a]">
                  Scoreboard data is incomplete: {sessionEndedPopup.error}
                </p>
              ) : sessionEndedPopup.entries.length === 0 ||
                sessionEndedPopup.entries.every(
                  (entry) => entry.issuesWorked === 0,
                ) ? (
                <p className="rounded-lg border border-dashed border-white/15 bg-[#070b18] p-5 text-center text-sm font-semibold text-[#94a3b8]">
                  No technician activity recorded for this session.
                </p>
              ) : (
                sessionEndedPopup.entries.map((entry, index) => {
                  const rank = index + 1;
                  const rankClassName =
                    rank === 1
                      ? "border-[#facc15]/60 bg-[#2a2105] text-[#fde68a]"
                      : rank === 2
                        ? "border-[#cbd5e1]/50 bg-[#1f2937] text-[#e2e8f0]"
                        : rank === 3
                          ? "border-[#fb923c]/55 bg-[#2b160c] text-[#fed7aa]"
                          : "border-white/10 bg-[#070b18] text-[#dbe4ef]";
                  const rankLabel =
                    rank === 1
                      ? "1st"
                      : rank === 2
                        ? "2nd"
                        : rank === 3
                          ? "3rd"
                          : `${rank}th`;

                  return (
                    <article
                      className={`rounded-xl border p-4 ${rankClassName}`}
                      key={entry.technicianName}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.14em] opacity-80">
                            {rankLabel} Place
                          </p>
                          <h3 className="mt-1 text-xl font-extrabold">
                            {getTemporaryTechnicianLabel(
                              entry.technicianName,
                            )}
                          </h3>
                        </div>
                        <span className="rounded-lg border border-current/30 bg-black/20 px-3 py-2 text-lg font-black">
                          {entry.score}
                        </span>
                      </div>
                      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <dt className="text-xs uppercase opacity-70">
                            Issues Worked
                          </dt>
                          <dd className="text-lg font-bold">
                            {entry.issuesWorked}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase opacity-70">
                            Resolved
                          </dt>
                          <dd className="text-lg font-bold">
                            {entry.issuesResolved}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase opacity-70">
                            Avg Resolution
                          </dt>
                          <dd className="font-bold">
                            {formatScoreboardDuration(
                              entry.averageResolutionMs,
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs uppercase opacity-70">
                            Hit Rate
                          </dt>
                          <dd className="font-bold">
                            {Math.round(entry.hitRate * 100)}%
                          </dd>
                        </div>
                      </dl>
                      <p className="mt-3 text-xs font-semibold opacity-75">
                        Effort bonuses: {entry.effortActions} | Not-fixed
                        returns: {entry.notFixedReturns}
                      </p>
                    </article>
                  );
                })
              )}
            </div>

            <div className="border-t border-white/10 p-4">
              <button
                className="min-h-14 w-full touch-manipulation rounded-lg bg-[#6d28d9] px-5 py-3 text-lg font-bold text-white transition active:bg-[#7c3aed]"
                onClick={closeScoreboard}
                type="button"
              >
                Close Scoreboard
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {actionConfirmation ? (
        <div
          aria-labelledby="technician-action-confirmation-title"
          aria-modal="true"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-5 backdrop-blur-sm"
          role="dialog"
        >
          <section className="w-full max-w-md rounded-xl border border-[#8b5cf6]/45 bg-[#0b1020] p-6 shadow-2xl shadow-black/60">
            <p
              className="text-sm font-bold uppercase tracking-[0.16em] text-[#a78bfa]"
              id="technician-action-confirmation-title"
            >
              Action Sent
            </p>
            <p className="mt-4 text-lg font-semibold leading-7 text-white">
              {actionConfirmation}
            </p>
            <button
              autoFocus
              className="mt-6 min-h-14 w-full touch-manipulation rounded-lg bg-[#6d28d9] px-5 py-3 text-lg font-bold text-white transition active:bg-[#7c3aed] md:hover:bg-[#7c3aed]"
              onClick={() => setActionConfirmation(null)}
              type="button"
            >
              OK
            </button>
          </section>
        </div>
      ) : null}
    </div>
  );
}
