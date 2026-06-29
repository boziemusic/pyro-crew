"use client";

import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useActiveShow } from "@/components/active-show-strip";
import {
  type ContinuityIssueType,
  formatIssueLabel,
  issueUsesCue,
  getIssueStatusClassName,
  IssueIdentifiers,
} from "@/components/issue-identifiers";
import { JoinCodeQr } from "@/components/join-code-qr";
import { DirectorAttentionQueue } from "@/components/director-attention-queue";
import {
  DirectorTechLocationMap,
  type TechnicianMapLocation,
} from "@/components/director-tech-location-map";
import {
  purgeIssueChatSession,
} from "@/components/issue-chat";
import {
  purgeIssueVoiceMemos,
} from "@/components/issue-voice-memos";
import {
  DirectChatButton,
  DirectChatWindow,
  purgeDirectMessages,
  useDirectChat,
} from "@/components/direct-chat";
import {
  DirectVoiceChatButton,
  DirectVoiceChatPanel,
  purgeDirectVoiceChat,
  useDirectVoiceChat,
} from "@/components/direct-voice-chat";
import { useFieldMap } from "@/components/field-map-store";
import { useShowPositions } from "@/components/position-store";
import {
  completeAdditionalTechnicianAssignments,
  createTechnicianNotice,
  removeTechnicianFromSession,
  useActiveAdditionalTechnicianAssignments,
  useJoinedSessionTechnicianNames,
} from "@/components/collaboration-store";
import {
  assignIssueToTechnician,
  useActiveIssueAssignments,
} from "@/components/issue-assignment-store";
import {
  getContinuitySessionPolicyMessage,
  setActiveContinuitySession,
  useActiveContinuitySession,
} from "@/components/active-continuity-session";
import {
  getTechnicianInitials,
  getTemporaryTechnicianLabel,
  setSelectedTemporaryTechnician,
  TEMPORARY_TECHNICIANS,
  type TemporaryTechnicianId,
} from "@/components/temporary-technician-store";
import {
  getHistoryReadFailureMessage,
  getHistoryWriteFailureMessage,
} from "@/lib/issue-status-history";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import {
  findFirstScriptEventForChannel,
  findScriptEvent,
  type ScriptEventRow,
} from "@/lib/script-events";
import {
  REOPENABLE_ISSUE_STATUSES,
  REOPEN_ISSUE_HISTORY_NOTE,
  reopenIssue,
} from "@/lib/reopen-issue";
import {
  playSuccess,
  playDirectorTechJoined,
  playDirectorUnreadCommunicationAttention,
  playUiClick,
  playWarning,
} from "@/lib/app-feedback";

const fieldClassName =
  "rounded-lg border border-[#334155] bg-[#020617] px-3 py-3 text-base font-semibold text-white placeholder:text-[#94a3b8] focus:border-[#8b5cf6] focus:outline-none focus:ring-2 focus:ring-[#4c00a4]/60";

const cannedDirectorNotes = [
  {
    label: "Poor Signal",
    note: "Module signal is poor, check/tighten antenna. Elevate antenna/mod if possible.",
  },
  {
    label: "Swapped Channels",
    note: "Banks/cables/slats may be swapped.",
  },
  {
    label: "Low Battery",
    note: "Battery low, may need to swap.",
  },
];

type IssueType = ContinuityIssueType;

type IssueRecord = {
  id: string;
  channel_number: number;
  cue_value: string;
  issue_type: string;
  status: string;
  position_name: string | null;
  effect_name: string | null;
  director_note: string | null;
  session_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type IssueHistoryNote = {
  issue_id: string;
  new_status: string;
  note: string | null;
  created_at: string | null;
};

type IssueAssignmentHistory = {
  issue_id: string;
  technician_name: string;
  assigned_at: string;
};

type SessionSummaryHistory = {
  issue_id: string;
  new_status: string;
  note: string | null;
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

type DuplicateIssue = {
  issue: IssueRecord;
  matchedCue: string | null;
  technicianName: string | null;
};

type TechnicianContextMenuState = {
  activeIssueCount: number;
  currentIssue: IssueRecord | null;
  technicianId: TemporaryTechnicianId;
  technicianName: string;
  unreadCount: number;
  x: number;
  y: number;
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

const overviewAttentionStatuses = new Set([
  "awaiting_verification",
  "director_assistance_requested",
  "additional_technician_requested",
  "unfixable_recommended",
]);

const resolvedStatuses = new Set(["verified_resolved", "closed"]);

function getExactCueEntries(value: string) {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return [];
  }

  const entries = normalizedValue.split(/[,;]+/).flatMap((group) => {
    const trimmedGroup = group.trim();

    if (/^\d+\s*-\s*\d+$/.test(trimmedGroup)) {
      return [trimmedGroup.replace(/\s*-\s*/g, "-")];
    }

    return trimmedGroup.split(/\s+/).filter(Boolean);
  });

  return entries.length > 1
    ? entries
    : [normalizedValue.replace(/\s*-\s*/g, "-")];
}

function findMatchingCueEntry(
  submittedCueValue: string,
  existingCueValue: string,
) {
  const existingEntries = new Set(getExactCueEntries(existingCueValue));

  return (
    getExactCueEntries(submittedCueValue).find((entry) =>
      existingEntries.has(entry),
    ) ?? null
  );
}

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
  const fieldMap = useFieldMap(activeShow?.id);
  const showPositions = useShowPositions(activeShow?.id);
  const activeSession = useActiveContinuitySession();
  const sessionForActiveShow =
    activeSession?.show_id === activeShow?.id ? activeSession : null;
  const {
    assignments: activeIssueAssignments,
    assignmentsByIssue: technicianAssignments,
    assignmentTimesByIssue: technicianAssignmentTimes,
    error: assignmentLoadError,
    refresh: refreshAssignments,
  } = useActiveIssueAssignments(
    activeShow?.id,
    sessionForActiveShow?.id,
  );
  const {
    assignmentsByIssue: additionalAssignments,
    assignmentTimesByIssue: additionalAssignmentTimes,
    refresh: refreshAdditionalAssignments,
  } = useActiveAdditionalTechnicianAssignments(
    activeShow?.id,
    sessionForActiveShow?.id,
  );
  const {
    refresh: refreshSessionJoinedTechnicians,
    technicianNames: sessionJoinedTechnicianNames,
  } =
    useJoinedSessionTechnicianNames(
      activeShow?.id,
      sessionForActiveShow?.id,
    );
  const isScripted = activeShow?.show_mode === "scripted";
  const isManual = activeShow?.show_mode === "manual";
  const [channelNumber, setChannelNumber] = useState("");
  const [cueValue, setCueValue] = useState("");
  const [positionName, setPositionName] = useState("");
  const [selectedPositionId, setSelectedPositionId] = useState("");
  const [issueType, setIssueType] = useState<IssueType | "">("");
  const [directorNote, setDirectorNote] = useState("");
  const [hasScriptEvents, setHasScriptEvents] = useState(false);
  const [resolvedScriptRow, setResolvedScriptRow] =
    useState<ScriptEventRow | null>(null);
  const [scriptLookupState, setScriptLookupState] = useState<
    "idle" | "loading" | "found" | "not_found" | "error"
  >("idle");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdIssue, setCreatedIssue] =
    useState<CreatedIssueFeedback | null>(null);
  const [duplicateIssue, setDuplicateIssue] =
    useState<DuplicateIssue | null>(null);
  const [highlightedIssueId, setHighlightedIssueId] = useState<
    string | null
  >(null);
  const [reopenTarget, setReopenTarget] = useState<IssueRecord | null>(
    null,
  );
  const [isReopening, setIsReopening] = useState(false);
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
  const [latestIssueActionAt, setLatestIssueActionAt] = useState<
    Record<string, string>
  >({});
  const [issueAssignmentHistory, setIssueAssignmentHistory] = useState<
    IssueAssignmentHistory[]
  >([]);
  const communicationTechnicianNames = useMemo(
    () =>
      [
        ...new Set([
          ...sessionJoinedTechnicianNames,
          ...Object.values(technicianAssignments),
          ...Object.values(additionalAssignments),
        ]),
      ].filter(Boolean),
    [
      additionalAssignments,
      sessionJoinedTechnicianNames,
      technicianAssignments,
    ],
  );
  const directorDirectChat = useDirectChat({
    readerRole: "director",
    readerTechnicianName: null,
    sessionId: sessionForActiveShow?.id,
    showId: activeShow?.id,
    technicianNames: communicationTechnicianNames,
  });
  const directorDirectVoiceChat = useDirectVoiceChat({
    readerRole: "director",
    readerTechnicianName: null,
    sessionId: sessionForActiveShow?.id,
    showId: activeShow?.id,
    technicianNames: communicationTechnicianNames,
  });
  const [directorAutoPlayVoiceMemoId, setDirectorAutoPlayVoiceMemoId] =
    useState<string | null>(null);
  const directorUnreadCommunicationCount = useMemo(
    () =>
      Object.values(directorDirectChat.unreadByTechnician).reduce(
        (total, count) => total + count,
        0,
      ) +
      Object.values(
        directorDirectVoiceChat.unreadByTechnician,
      ).reduce(
        (total, count) => total + count,
        0,
      ),
    [
      directorDirectChat.unreadByTechnician,
      directorDirectVoiceChat.unreadByTechnician,
    ],
  );
  const [expandedStatuses, setExpandedStatuses] = useState<Set<string>>(
    new Set(),
  );
  const [assigningIssueId, setAssigningIssueId] = useState<string | null>(
    null,
  );
  const [reassigningIssueId, setReassigningIssueId] = useState<
    string | null
  >(null);
  const [assignmentFeedback, setAssignmentFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [assignmentWarning, setAssignmentWarning] = useState<string | null>(
    null,
  );
  const [timerNow, setTimerNow] = useState<number | null>(null);
  const [isTechLocationMapOpen, setIsTechLocationMapOpen] =
    useState(false);
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
  const [technicianRemovalTarget, setTechnicianRemovalTarget] =
    useState<{
      activeIssueCount: number;
      id: TemporaryTechnicianId;
      name: string;
    } | null>(null);
  const [technicianContextMenu, setTechnicianContextMenu] =
    useState<TechnicianContextMenuState | null>(null);
  const [isRemovingTechnician, setIsRemovingTechnician] = useState(false);
  const joinedTechnicianSoundSnapshot = useRef<Set<string> | null>(null);
  const highlightTimeoutRef = useRef<number | null>(null);
  const technicianContextMenuRef = useRef<HTMLDivElement>(null);
  const positionGroupNames = useMemo(
    () =>
      new Map(
        showPositions.groups.map((group) => [group.id, group.name]),
      ),
    [showPositions.groups],
  );
  const hasParsedScript = hasScriptEvents;
  const cueIsRequired = issueUsesCue(issueType);
  const cueIsRange = /^\s*\d+\s*-\s*\d+\s*$/.test(cueValue);

  useEffect(() => {
    if (directorUnreadCommunicationCount === 0) {
      return;
    }

    playDirectorUnreadCommunicationAttention();
    const intervalId = window.setInterval(
      playDirectorUnreadCommunicationAttention,
      5500,
    );

    return () => window.clearInterval(intervalId);
  }, [directorUnreadCommunicationCount]);

  useEffect(() => {
    if (!technicianContextMenu) {
      return;
    }

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !technicianContextMenuRef.current?.contains(event.target)
      ) {
        setTechnicianContextMenu(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setTechnicianContextMenu(null);
      }
    };
    const closeMenu = () => setTechnicianContextMenu(null);

    window.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);

    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [technicianContextMenu]);

  useEffect(() => {
    const loadScriptEventCount = async () => {
      setResolvedScriptRow(null);
      setScriptLookupState("idle");

      if (!activeShow) {
        setHasScriptEvents(false);
        return;
      }

      const { count, error } = await supabase
        .from("script_events")
        .select("id", { count: "exact", head: true })
        .eq("show_id", activeShow.id);

      setHasScriptEvents(!error && (count ?? 0) > 0);
    };

    void loadScriptEventCount();
  }, [activeShow, supabase]);

  useEffect(() => {
    if (!activeShow || !hasScriptEvents || !channelNumber || !issueType) {
      const resetId = window.setTimeout(() => {
        setResolvedScriptRow(null);
        setScriptLookupState("idle");
      }, 0);

      return () => window.clearTimeout(resetId);
    }

    if (cueIsRequired && (!cueValue.trim() || cueIsRange)) {
      const resetId = window.setTimeout(() => {
        setResolvedScriptRow(null);
        setScriptLookupState("idle");
      }, 0);

      return () => window.clearTimeout(resetId);
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setResolvedScriptRow(null);
      setScriptLookupState("loading");
      const { data, error } = cueIsRequired
        ? await findScriptEvent(
            supabase,
            activeShow.id,
            Number(channelNumber),
            cueValue,
          )
        : await findFirstScriptEventForChannel(
            supabase,
            activeShow.id,
            Number(channelNumber),
          );

      if (cancelled) {
        return;
      }

      if (error) {
        setResolvedScriptRow(null);
        setScriptLookupState("error");
      } else if (data) {
        setResolvedScriptRow(data as ScriptEventRow);
        setScriptLookupState("found");
      } else {
        setResolvedScriptRow(null);
        setScriptLookupState("not_found");
      }
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    activeShow,
    channelNumber,
    cueIsRange,
    cueIsRequired,
    cueValue,
    hasScriptEvents,
    issueType,
    supabase,
  ]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setTimerNow(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(
    () => () => {
      if (highlightTimeoutRef.current !== null) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!sessionForActiveShow) {
      joinedTechnicianSoundSnapshot.current = null;
      return;
    }

    const nextSnapshot = new Set(sessionJoinedTechnicianNames);
    const previousSnapshot = joinedTechnicianSoundSnapshot.current;

    if (previousSnapshot) {
      const hasNewTechnician = sessionJoinedTechnicianNames.some(
        (technicianName) => !previousSnapshot.has(technicianName),
      );

      if (hasNewTechnician) {
        playDirectorTechJoined();
      }
    }

    joinedTechnicianSoundSnapshot.current = nextSnapshot;
  }, [sessionForActiveShow, sessionJoinedTechnicianNames]);

  const fetchIssues = useCallback(async () => {
    if (!activeShow) {
      return { data: [], error: null };
    }

    return supabase
      .from("issues")
      .select(
        "id, channel_number, cue_value, issue_type, status, position_name, effect_name, director_note, session_id, created_at, updated_at",
      )
      .eq("show_id", activeShow.id)
      .order("created_at", { ascending: false });
  }, [activeShow, supabase]);

  const refreshLatestNotes = useCallback(
    async (issueRecords: IssueRecord[]) => {
      if (issueRecords.length === 0) {
        setLatestIssueNotes({});
        setCurrentStatusEnteredAt({});
        setLatestIssueActionAt({});
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
      const actionAt: Record<string, string> = {};

      for (const history of (data ?? []) as IssueHistoryNote[]) {
        if (history.created_at && !actionAt[history.issue_id]) {
          actionAt[history.issue_id] = history.created_at;
        }

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
      setLatestIssueActionAt(actionAt);
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

  const refreshIssueAssignmentHistory = useCallback(async () => {
    if (!activeShow) {
      setIssueAssignmentHistory([]);
      return;
    }

    let query = supabase
      .from("issue_assignments")
      .select("issue_id, technician_name, assigned_at")
      .eq("show_id", activeShow.id);

    query = sessionForActiveShow
      ? query.eq("session_id", sessionForActiveShow.id)
      : query.is("session_id", null);

    const { data, error } = await query.order("assigned_at", {
      ascending: false,
    });

    if (!error) {
      setIssueAssignmentHistory(
        (data ?? []) as IssueAssignmentHistory[],
      );
    }
  }, [activeShow, sessionForActiveShow, supabase]);

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
    const assignmentHistoryLoadId = window.setTimeout(() => {
      void refreshIssueAssignmentHistory();
    }, 0);

    return () => window.clearTimeout(assignmentHistoryLoadId);
  }, [
    fetchIssues,
    refreshIssueAssignmentHistory,
    refreshLatestNotes,
  ]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshIssues();
      void refreshIssueAssignmentHistory();
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [refreshIssueAssignmentHistory, refreshIssues]);

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

  const latestIssue = sessionForActiveShow
    ? issues.find((issue) => issue.session_id === sessionForActiveShow.id) ??
      null
    : issues.find((issue) => issue.session_id === null) ?? null;

  const latestHistoricalTechnicianByIssue = useMemo(() => {
    const assignments = new Map<string, string>();

    issueAssignmentHistory.forEach((assignment) => {
      if (!assignments.has(assignment.issue_id)) {
        assignments.set(
          assignment.issue_id,
          assignment.technician_name,
        );
      }
    });

    return assignments;
  }, [issueAssignmentHistory]);

  const technicianOptions = useMemo(() => {
    const names = new Set(
      sessionJoinedTechnicianNames
        .map((name) => name.trim())
        .filter(Boolean),
    );

    activeIssueAssignments.forEach((assignment) => {
      if (assignment.technician_name.trim()) {
        names.add(assignment.technician_name.trim());
      }
    });
    Object.values(technicianAssignments).forEach((name) => {
      if (name?.trim()) {
        names.add(name.trim());
      }
    });
    Object.values(additionalAssignments).forEach((name) => {
      if (name?.trim()) {
        names.add(name.trim());
      }
    });
    issueAssignmentHistory.forEach((assignment) => {
      if (assignment.technician_name.trim()) {
        names.add(assignment.technician_name.trim());
      }
    });

    const joinedOptions = [...names].map((name) => ({
      id: name as TemporaryTechnicianId,
      label: getTemporaryTechnicianLabel(name),
    }));

    return joinedOptions.length > 0
      ? joinedOptions
      : TEMPORARY_TECHNICIANS;
  }, [
    activeIssueAssignments,
    additionalAssignments,
    issueAssignmentHistory,
    sessionJoinedTechnicianNames,
    technicianAssignments,
  ]);

  const technicianOverview = useMemo(
    () =>
      technicianOptions.map((technician) => {
        const assignmentsForTechnician = activeIssueAssignments.filter(
          (assignment) => assignment.technician_name === technician.id,
        );
        const assignmentByIssue = new Map(
          assignmentsForTechnician.map((assignment) => [
            assignment.issue_id,
            assignment,
          ]),
        );
        const technicianIssues = issues.filter(
          (issue) =>
            technicianAssignments[issue.id] === technician.id ||
            additionalAssignments[issue.id] === technician.id ||
            latestHistoricalTechnicianByIssue.get(issue.id) ===
              technician.id,
        );
        const activeIssues = technicianIssues
          .filter(
            (issue) => !terminalStatuses.has(issue.status),
          )
          .map((issue) => {
            const isPrimary =
              technicianAssignments[issue.id] === technician.id;
            const assignedAt = isPrimary
              ? technicianAssignmentTimes[issue.id]
              : additionalAssignmentTimes[issue.id];
            const assignment = assignmentByIssue.get(issue.id);

            return {
              issue,
                assignedAt:
                  issue.status === "in_progress"
                    ? currentStatusEnteredAt[issue.id] ??
                      issue.updated_at ??
                      assignedAt ??
                      issue.created_at
                    : issue.status === "retrieving_parts" &&
                        assignment?.acknowledged_at
                      ? assignment.acknowledged_at
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
          ({ issue }) => {
            const assignment = assignmentByIssue.get(issue.id);

            return (
              issue.status === "in_progress" ||
              (issue.status === "retrieving_parts" &&
                Boolean(assignment?.acknowledged_at))
            );
          },
        ).sort((left, right) => {
          const leftAssignment = assignmentByIssue.get(left.issue.id);
          const rightAssignment = assignmentByIssue.get(right.issue.id);
          const leftTime =
            leftAssignment?.acknowledged_at ??
            currentStatusEnteredAt[left.issue.id] ??
            left.issue.updated_at ??
            left.assignedAt;
          const rightTime =
            rightAssignment?.acknowledged_at ??
            currentStatusEnteredAt[right.issue.id] ??
            right.issue.updated_at ??
            right.assignedAt;

          return getTimestampValue(rightTime) - getTimestampValue(leftTime);
        });
        const resolvedCount = issues.filter(
          (issue) =>
            issue.session_id === sessionForActiveShow?.id &&
            resolvedStatuses.has(issue.status) &&
            (technicianAssignments[issue.id] === technician.id ||
              additionalAssignments[issue.id] === technician.id),
        ).length;
        const workingLocationIssue =
          workingIssues.find(({ issue }) =>
            Boolean(issue.position_name?.trim()),
          ) ?? null;
        const awaitingDirectorLocationIssue =
          activeIssues
            .filter(
              ({ issue }) => overviewAttentionStatuses.has(issue.status),
            )
            .sort(
              (left, right) =>
                getTimestampValue(
                  latestIssueActionAt[right.issue.id] ??
                    right.issue.updated_at ??
                    right.assignedAt,
                ) -
                getTimestampValue(
                  latestIssueActionAt[left.issue.id] ??
                    left.issue.updated_at ??
                    left.assignedAt,
                ),
            )[0] ?? null;
        const assignedLocationIssue =
          activeIssues.find(({ issue }) => {
            const assignment = assignmentByIssue.get(issue.id);

            return (
              Boolean(issue.position_name?.trim()) &&
              (issue.status === "assigned" ||
                (issue.status === "retrieving_parts" &&
                  !assignment?.acknowledged_at))
            );
          }) ?? null;
        const lastKnownIssue =
          technicianIssues
            .filter((issue) => Boolean(issue.position_name?.trim()))
            .sort(
              (left, right) =>
                getTimestampValue(
                  latestIssueActionAt[right.id] ??
                    right.updated_at ??
                    technicianAssignmentTimes[right.id] ??
                    right.created_at,
                ) -
                getTimestampValue(
                  latestIssueActionAt[left.id] ??
                    left.updated_at ??
                    technicianAssignmentTimes[left.id] ??
                    left.created_at,
                ),
            )[0] ?? null;
        const locationIssue =
          workingLocationIssue ??
          awaitingDirectorLocationIssue ??
          assignedLocationIssue ??
          lastKnownIssue;
        const locationSource:
          | "working"
          | "awaiting-director"
          | "assigned"
          | "last-known"
          | "none" = workingLocationIssue
          ? "working"
          : awaitingDirectorLocationIssue
            ? "awaiting-director"
            : assignedLocationIssue
              ? "assigned"
              : lastKnownIssue
                ? "last-known"
                : "none";
        const awaitingDirectorCount = activeIssues.filter(({ issue }) =>
          overviewAttentionStatuses.has(issue.status),
        ).length;
        const hasUnreadCommunication =
          (directorDirectChat.unreadByTechnician[technician.id] ?? 0) >
            0 ||
          (directorDirectVoiceChat.unreadByTechnician[
            technician.id
          ] ?? 0) > 0;

        return {
          ...technician,
          activeIssues,
          hasAttention: activeIssues.some(({ issue }) =>
            overviewAttentionStatuses.has(issue.status),
          ),
          hasUnreadCommunication,
          currentIssue: workingIssues[0] ?? null,
          locationIssue: locationIssue
            ? "issue" in locationIssue
              ? locationIssue.issue
              : locationIssue
            : null,
          locationActivityAt: workingLocationIssue
            ? workingLocationIssue.assignedAt
            : awaitingDirectorLocationIssue
              ? latestIssueActionAt[
                  awaitingDirectorLocationIssue.issue.id
                ] ??
                awaitingDirectorLocationIssue.issue.updated_at ??
                awaitingDirectorLocationIssue.assignedAt
              : assignedLocationIssue
                ? assignedLocationIssue.assignedAt
                : lastKnownIssue
                  ? latestIssueActionAt[lastKnownIssue.id] ??
                    lastKnownIssue.updated_at ??
                    technicianAssignmentTimes[lastKnownIssue.id] ??
                    lastKnownIssue.created_at
                  : null,
          locationSource,
          awaitingDirectorCount,
          resolvedCount,
          workingCount: workingIssues.length,
          queueCount: activeIssues.filter(
            ({ issue }) => issue.status === "assigned",
          ).length,
        };
      }),
    [
      activeIssueAssignments,
      additionalAssignmentTimes,
      additionalAssignments,
      currentStatusEnteredAt,
      directorDirectChat.unreadByTechnician,
      directorDirectVoiceChat.unreadByTechnician,
      issues,
      technicianOptions,
      latestHistoricalTechnicianByIssue,
      latestIssueActionAt,
      sessionForActiveShow?.id,
      technicianAssignmentTimes,
      technicianAssignments,
    ],
  );
  const technicianMapLocations = useMemo<TechnicianMapLocation[]>(
    () =>
      technicianOverview.map((technician) => ({
        activityStartedAt: technician.locationActivityAt,
        channelNumber:
          technician.locationIssue?.channel_number ?? null,
        cueValue: technician.locationIssue?.cue_value ?? null,
        id: technician.id,
        issueType: technician.locationIssue?.issue_type ?? null,
        label: technician.label,
        positionName: technician.locationIssue?.position_name ?? null,
        resolvedCount: technician.resolvedCount,
        shortLabel: getTechnicianInitials(technician.label),
        status:
          technician.locationSource === "none"
            ? "ready"
            : technician.locationSource,
      })),
    [technicianOverview],
  );
  const directorCommunicationIssue = useMemo(() => {
    const technicianName =
      directorDirectChat.openTechnicianName ??
      directorDirectVoiceChat.openTechnicianName;
    const issue = technicianName
      ? technicianOverview.find(
          (technician) => technician.id === technicianName,
        )?.currentIssue?.issue
      : null;

    return issue
      ? {
          channelNumber: issue.channel_number,
          cueValue: issue.cue_value,
          issueType: issue.issue_type,
          positionName: issue.position_name,
        }
      : null;
  }, [
    directorDirectChat.openTechnicianName,
    directorDirectVoiceChat.openTechnicianName,
    technicianOverview,
  ]);

  const confirmRemoveTechnician = async () => {
    if (!technicianRemovalTarget || !activeShow || !sessionForActiveShow) {
      return;
    }

    if (technicianRemovalTarget.activeIssueCount > 0) {
      setAssignmentFeedback({
        type: "error",
        message:
          "Reassign or resolve this technician's active issues before removing them.",
      });
      setTechnicianRemovalTarget(null);
      return;
    }

    setIsRemovingTechnician(true);
    const { error } = await removeTechnicianFromSession({
      sessionId: sessionForActiveShow.id,
      showId: activeShow.id,
      technicianId: technicianRemovalTarget.id,
    });

    if (error) {
      setAssignmentFeedback({
        type: "error",
        message: `Could not remove technician: ${error.message}`,
      });
    } else {
      setAssignmentFeedback({
        type: "success",
        message: `${technicianRemovalTarget.name} removed from this session.`,
      });
      await refreshSessionJoinedTechnicians();
    }

    setIsRemovingTechnician(false);
    setTechnicianRemovalTarget(null);
  };

  const assignmentSuggestions = useMemo(() => {
    const resolveMarker = (positionName: string | null) => {
      if (!positionName) {
        return null;
      }

      const normalizedName = positionName.trim().toLocaleLowerCase();
      const position = showPositions.positions.find(
        (candidate) =>
          candidate.name.trim().toLocaleLowerCase() === normalizedName,
      );
      const directMarker = fieldMap.markers.find(
        (marker) =>
          marker.entityType === "position" &&
          marker.markerName.trim().toLocaleLowerCase() ===
            (position?.name.trim().toLocaleLowerCase() ??
              normalizedName),
      );

      if (directMarker) {
        return directMarker;
      }

      const group = position?.groupId
        ? showPositions.groups.find(
            (candidate) => candidate.id === position.groupId,
          )
        : showPositions.groups.find(
            (candidate) =>
              candidate.name.trim().toLocaleLowerCase() ===
              normalizedName,
          );

      return group
        ? fieldMap.markers.find(
            (marker) =>
              marker.entityType === "group" &&
              marker.markerName.trim().toLocaleLowerCase() ===
                group.name.trim().toLocaleLowerCase(),
          ) ?? null
        : null;
    };
    const suggestions = new Map<string, string>();

    issues
      .filter((issue) => issue.status === "new")
      .forEach((issue) => {
        const issueMarker = resolveMarker(issue.position_name);
        const scoredTechnicians = technicianOverview.map((technician) => {
          const workloadScore =
            technician.workingCount * 3 +
            technician.queueCount * 2 +
            technician.awaitingDirectorCount * 0.5;
          const technicianMarker = resolveMarker(
            technician.locationIssue?.position_name ?? null,
          );
          let proximityScore = 0;

          if (issue.position_name) {
            proximityScore =
              issueMarker && technicianMarker
                ? Math.hypot(
                    issueMarker.x - technicianMarker.x,
                    issueMarker.y - technicianMarker.y,
                  )
                : 60;
          }

          return {
            label: technician.label,
            score: workloadScore * 100 + proximityScore,
          };
        });
        scoredTechnicians.sort(
          (left, right) =>
            left.score - right.score ||
            left.label.localeCompare(right.label),
        );
        suggestions.set(
          issue.id,
          scoredTechnicians[0]?.label ??
            "No recommendation available",
        );
      });

    // TODO(zone/team assignments): explicit zone and team ownership will
    // eventually take precedence over general workload and field proximity.
    return suggestions;
  }, [
    fieldMap.markers,
    issues,
    showPositions.groups,
    showPositions.positions,
    technicianOverview,
  ]);

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

    playUiClick();
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

    const { error: assignmentError } = await assignIssueToTechnician({
      issueId: issue.id,
      sessionId: issue.session_id ?? sessionForActiveShow?.id ?? null,
      showId: activeShow.id,
      technicianId,
    });

    if (assignmentError) {
      setAssignmentFeedback({
        type: "error",
        message: `Issue status changed, but shared assignment failed: ${assignmentError.message}`,
      });
      setAssigningIssueId(null);
      return;
    }

    const { error: noticeError } = await createTechnicianNotice({
      issueId: issue.id,
      message: `You were assigned ${formatIssueLabel(issue.issue_type)}.`,
      noticeType: "assignment",
      sessionId: issue.session_id ?? sessionForActiveShow?.id ?? null,
      showId: activeShow.id,
      technicianId,
      title: "New Issue Assigned",
    });

    const { error: historyError } = await supabase
      .from("issue_status_history")
      .insert({
        changed_by_user_id: null,
        issue_id: issue.id,
        new_status: "assigned",
        note: `Assigned to ${getTemporaryTechnicianLabel(technicianId)} and placed In Queue.`,
        old_status: issue.status,
      });

    setAssignmentFeedback({
      type: "success",
      message: `${getTemporaryTechnicianLabel(technicianId)} assigned. Issue moved to In Queue.`,
    });
    playSuccess();
    setAssignmentWarning(
      historyError
        ? getHistoryWriteFailureMessage(historyError.message)
        : noticeError
          ? `Assignment saved, but technician notice failed: ${noticeError.message}`
          : null,
    );
    await Promise.all([refreshIssues(), refreshAssignments()]);
    setAssigningIssueId(null);
  };

  const reassignTechnician = async (
    issue: IssueRecord,
    technicianId: TemporaryTechnicianId,
  ) => {
    if (!activeShow) {
      return;
    }

    const originalTechnician = technicianAssignments[issue.id];

    if (!originalTechnician || originalTechnician === technicianId) {
      return;
    }
    const sessionId = issue.session_id ?? sessionForActiveShow?.id ?? null;
    const originalLabel =
      getTemporaryTechnicianLabel(originalTechnician);
    const newLabel = getTemporaryTechnicianLabel(technicianId);

    playUiClick();
    setReassigningIssueId(issue.id);
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
        message: `Could not reassign technician: ${updateError.message}`,
      });
      setReassigningIssueId(null);
      return;
    }

    const { error: assignmentError } = await assignIssueToTechnician({
      issueId: issue.id,
      sessionId: issue.session_id ?? sessionForActiveShow?.id ?? null,
      showId: activeShow.id,
      technicianId,
    });

    if (assignmentError) {
      setAssignmentFeedback({
        type: "error",
        message: `Issue status changed, but shared reassignment failed: ${assignmentError.message}`,
      });
      setReassigningIssueId(null);
      return;
    }

    await completeAdditionalTechnicianAssignments(issue.id);

    const wasNewTechnicianAlreadyHelper =
      additionalAssignments[issue.id] === technicianId;
    const noticeResults = await Promise.all([
      createTechnicianNotice({
        issueId: issue.id,
        message: `The Director moved this issue to ${newLabel}.`,
        noticeType: "reassigned",
        sessionId,
        showId: activeShow.id,
        technicianId: originalTechnician,
        title: "Issue Reassigned",
      }),
      createTechnicianNotice({
        issueId: issue.id,
        message: wasNewTechnicianAlreadyHelper
          ? "You are now the primary technician for this issue."
          : `This issue was handed off from ${originalLabel}.`,
        noticeType: "handoff",
        sessionId,
        showId: activeShow.id,
        technicianId,
        title: wasNewTechnicianAlreadyHelper
          ? "Primary Technician Assignment"
          : "Issue Handoff",
      }),
    ]);
    const handoffError = noticeResults.find((result) => result.error)?.error;
    const { error: historyError } = await supabase
      .from("issue_status_history")
      .insert({
        changed_by_user_id: null,
        issue_id: issue.id,
        new_status: "assigned",
        note:
          issue.status === "assigned"
            ? `Reassigned from ${originalLabel} to ${newLabel}.`
            : `Reassigned from ${originalLabel} to ${newLabel}. Previous status: ${formatIssueLabel(issue.status)}. Handoff notices created.`,
        old_status: issue.status,
      });

    setAssignmentFeedback({
      type: "success",
      message: `${newLabel} assigned. Issue moved to In Queue.`,
    });
    playSuccess();
    setAssignmentWarning(
      historyError
        ? getHistoryWriteFailureMessage(historyError.message)
        : handoffError
          ? `Reassignment saved, but handoff notice failed: ${handoffError.message}`
          : null,
    );
    await Promise.all([refreshIssues(), refreshAssignments()]);
    setReassigningIssueId(null);
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

    if (sessionForActiveShow.status === "active") {
      const { error: endError } = await supabase
        .from("continuity_sessions")
        .update({
          ended_at: proposedEndAt,
          ended_by_user_id: null,
          status: "ended",
        })
        .eq("id", sessionForActiveShow.id)
        .eq("show_id", sessionForActiveShow.show_id);

      if (endError) {
        setSessionSummaryError(
          getContinuitySessionPolicyMessage(
            `Could not end continuity session: ${endError.message}.`,
          ),
        );
        setIsLoadingSessionSummary(false);
        return;
      }

      setActiveContinuitySession({
        ...sessionForActiveShow,
        status: "ended",
      });
    }

    const { error: chatCleanupError } = await purgeIssueChatSession(
      supabase,
      sessionForActiveShow.id,
    );

    if (chatCleanupError) {
      setSessionSummaryError(
        `Continuity session ended, but temporary issue chat could not be cleared: ${chatCleanupError.message}`,
      );
      setIsLoadingSessionSummary(false);
      return;
    }

    const { error: voiceMemoCleanupError } =
      await purgeIssueVoiceMemos(supabase, {
        sessionId: sessionForActiveShow.id,
      });

    if (voiceMemoCleanupError) {
      setSessionSummaryError(
        `Continuity session ended, but temporary voice chat could not be cleared: ${voiceMemoCleanupError.message}`,
      );
      setIsLoadingSessionSummary(false);
      return;
    }

    const { error: directMessageCleanupError } =
      await purgeDirectMessages(supabase, sessionForActiveShow.id);
    if (directMessageCleanupError) {
      setSessionSummaryError(
        `Continuity session ended, but direct messages could not be cleared: ${directMessageCleanupError.message}`,
      );
      setIsLoadingSessionSummary(false);
      return;
    }

    const { error: directVoiceCleanupError } =
      await purgeDirectVoiceChat(supabase, sessionForActiveShow.id);
    if (directVoiceCleanupError) {
      setSessionSummaryError(
        `Continuity session ended, but direct Voice Chat could not be cleared: ${directVoiceCleanupError.message}`,
      );
      setIsLoadingSessionSummary(false);
      return;
    }

    const { data: sessionIssuesData, error: issuesError } = await supabase
      .from("issues")
      .select(
        "id, channel_number, cue_value, issue_type, status, position_name, director_note, created_at, updated_at",
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
        .select("issue_id, new_status, note, created_at")
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
        if (!terminalStatuses.has(issue.status)) {
          return [];
        }

        const isPrimary =
          technicianAssignments[issue.id] === technician.id;
        const assignedAt = getTimestampValue(
          isPrimary
            ? technicianAssignmentTimes[issue.id]
            : additionalAssignmentTimes[issue.id],
        );
        const issueHistory = historyByIssue.get(issue.id) ?? [];
        let lastReopenedIndex = -1;
        issueHistory.forEach((history, index) => {
          if (history.note?.trim() === REOPEN_ISSUE_HISTORY_NOTE) {
            lastReopenedIndex = index;
          }
        });
        const completedAt = getTimestampValue(
          issueHistory
            .slice(lastReopenedIndex + 1)
            .find(
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

    if (sessionForActiveShow.status === "active") {
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
        setIsEndingSession(false);
        return;
      }
    }

    const { error: chatCleanupError } = await purgeIssueChatSession(
      supabase,
      sessionForActiveShow.id,
    );

    if (chatCleanupError) {
      setSessionMessage(
        `Continuity session ended, but temporary issue chat could not be cleared: ${chatCleanupError.message}`,
      );
      setIsEndingSession(false);
      return;
    }

    const { error: voiceMemoCleanupError } =
      await purgeIssueVoiceMemos(supabase, {
        sessionId: sessionForActiveShow.id,
      });

    if (voiceMemoCleanupError) {
      setSessionMessage(
        `Continuity session ended, but temporary voice chat could not be cleared: ${voiceMemoCleanupError.message}`,
      );
      setIsEndingSession(false);
      return;
    }

    const { error: directMessageCleanupError } =
      await purgeDirectMessages(supabase, sessionForActiveShow.id);
    if (directMessageCleanupError) {
      setSessionMessage(
        `Continuity session ended, but direct messages could not be cleared: ${directMessageCleanupError.message}`,
      );
      setIsEndingSession(false);
      return;
    }

    const { error: directVoiceCleanupError } =
      await purgeDirectVoiceChat(supabase, sessionForActiveShow.id);
    if (directVoiceCleanupError) {
      setSessionMessage(
        `Continuity session ended, but direct Voice Chat could not be cleared: ${directVoiceCleanupError.message}`,
      );
      setIsEndingSession(false);
      return;
    }

    setActiveContinuitySession(null);
    setEndSessionStep(null);
    setEndSessionSummary(null);
    setSessionMessage("Continuity session ended.");

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

    if (!channelNumber || !issueType || (cueIsRequired && !cueValue.trim())) {
      setErrorMessage(
        cueIsRequired
          ? "Issue Type, Channel, and Cue(s) are required."
          : "Issue Type and Channel are required.",
      );
      return;
    }

    setIsSubmitting(true);

    if (sessionForActiveShow) {
      const { data: possibleDuplicates, error: duplicateCheckError } =
        await supabase
          .from("issues")
          .select(
            "id, channel_number, cue_value, issue_type, status, position_name, effect_name, director_note, session_id, created_at, updated_at",
          )
          .eq("show_id", activeShow.id)
          .eq("session_id", sessionForActiveShow.id)
          .eq("channel_number", Number(channelNumber))
          .order("created_at", { ascending: false });

      if (duplicateCheckError) {
        setErrorMessage(
          `Could not check for duplicate issues: ${duplicateCheckError.message}`,
        );
        setIsSubmitting(false);
        return;
      }

      const duplicateMatch = (
        (possibleDuplicates ?? []) as IssueRecord[]
      ).find((issue) => {
        if (cueIsRequired) {
          return findMatchingCueEntry(cueValue, issue.cue_value);
        }

        return issue.issue_type === issueType;
      });

      if (duplicateMatch) {
        const { data: assignmentData, error: assignmentError } =
          await supabase
            .from("issue_assignments")
            .select("technician_name")
            .eq("issue_id", duplicateMatch.id)
            .eq("status", "active")
            .maybeSingle();

        if (assignmentError) {
          setErrorMessage(
            `The duplicate issue was found, but its assignment could not be loaded: ${assignmentError.message}`,
          );
          setIsSubmitting(false);
          return;
        }

        setDuplicateIssue({
          issue: duplicateMatch,
          matchedCue: cueIsRequired
            ? findMatchingCueEntry(cueValue, duplicateMatch.cue_value) ??
              cueValue.trim()
            : null,
          technicianName:
            (assignmentData as { technician_name?: string } | null)
              ?.technician_name ??
            latestHistoricalTechnicianByIssue.get(duplicateMatch.id) ??
            null,
        });
        setIsSubmitting(false);
        playWarning();
        return;
      }
    }

    let scriptRowForSubmission = resolvedScriptRow;

    if (hasParsedScript && (!cueIsRequired || !cueIsRange)) {
      const { data: scriptEvent, error: scriptEventError } = cueIsRequired
        ? await findScriptEvent(
            supabase,
            activeShow.id,
            Number(channelNumber),
            cueValue,
          )
        : await findFirstScriptEventForChannel(
            supabase,
            activeShow.id,
            Number(channelNumber),
          );

      if (scriptEventError) {
        setErrorMessage(
          `Could not resolve the script event: ${scriptEventError.message}`,
        );
        setIsSubmitting(false);
        return;
      }

      scriptRowForSubmission = scriptEvent as ScriptEventRow | null;
      setResolvedScriptRow(scriptRowForSubmission);
      setScriptLookupState(
        scriptRowForSubmission ? "found" : "not_found",
      );
    }

    const selectedPosition = showPositions.positions.find(
      (position) => position.id === selectedPositionId,
    );
    const submittedPositionName =
      scriptRowForSubmission?.position_name ??
      (!hasParsedScript
        ? selectedPosition?.name ?? (isManual ? positionName.trim() : "")
        : "");
    const submittedEffectName = scriptRowForSubmission?.effect_name ?? null;

    // Parsed script position supersedes manual selection. Future adapters may
    // add richer matching and multi-cue resolution.
    const insertValues = {
      assigned_to_user_id: null,
      channel_number: Number(channelNumber),
      created_by_user_id: null,
      cue_value: cueIsRequired ? cueValue.trim() : "",
      director_note: directorNote.trim() || null,
      effect_name: submittedEffectName,
      issue_source: "manual_director_entry",
      issue_type: issueType,
      session_id: sessionForActiveShow?.id ?? null,
      show_id: activeShow.id,
      status: "new",
      ...(submittedPositionName
        ? { position_name: submittedPositionName }
        : {}),
    };

    const { error } = await supabase.from("issues").insert(insertValues);

    if (error) {
      setErrorMessage(`Could not create issue: ${error.message}`);
    } else {
      setCreatedIssue({
        channelNumber: Number(channelNumber),
        cueValue: cueIsRequired ? cueValue.trim() : "",
        issueType,
      });
      setChannelNumber("");
      setCueValue("");
      setPositionName("");
      setSelectedPositionId("");
      setIssueType("");
      setDirectorNote("");
      await refreshIssues();
    }

    setIsSubmitting(false);
  };

  const focusIssueInSummary = (issue: IssueRecord) => {
    setExpandedStatuses((current) => new Set(current).add(issue.status));
    setHighlightedIssueId(issue.id);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const issueElement = document.getElementById(
          `director-issue-${issue.id}`,
        );

        issueElement?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        issueElement?.focus({ preventScroll: true });
      });
    });

    if (highlightTimeoutRef.current !== null) {
      window.clearTimeout(highlightTimeoutRef.current);
    }

    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedIssueId((current) =>
        current === issue.id ? null : current,
      );
      highlightTimeoutRef.current = null;
    }, 3000);
  };

  const openDuplicateIssue = () => {
    if (!duplicateIssue) {
      return;
    }

    const issue = duplicateIssue.issue;

    setDuplicateIssue(null);
    focusIssueInSummary(issue);
  };

  const openTechnicianContextMenu = (
    technician: Omit<TechnicianContextMenuState, "x" | "y">,
    x: number,
    y: number,
  ) => {
    const menuWidth = 256;
    const menuHeight = 210;
    const viewportPadding = 8;

    setTechnicianContextMenu({
      ...technician,
      x: Math.max(
        viewportPadding,
        Math.min(x, window.innerWidth - menuWidth - viewportPadding),
      ),
      y: Math.max(
        viewportPadding,
        Math.min(y, window.innerHeight - menuHeight - viewportPadding),
      ),
    });
  };

  const viewTechnicianCurrentIssue = () => {
    if (!technicianContextMenu?.currentIssue) {
      return;
    }

    const issue = technicianContextMenu.currentIssue;
    setTechnicianContextMenu(null);
    focusIssueInSummary(issue);
  };

  const openTechnicianIssueChat = () => {
    if (!technicianContextMenu) {
      return;
    }

    const technicianName = technicianContextMenu.technicianId;
    setTechnicianContextMenu(null);
    directorDirectChat.openChat(technicianName);
  };

  const requestTechnicianRemovalFromMenu = () => {
    if (!technicianContextMenu) {
      return;
    }

    setTechnicianRemovalTarget({
      activeIssueCount: technicianContextMenu.activeIssueCount,
      id: technicianContextMenu.technicianId,
      name: technicianContextMenu.technicianName,
    });
    setTechnicianContextMenu(null);
  };

  const confirmReopenIssue = async () => {
    if (!reopenTarget || !activeShow) {
      return;
    }

    setIsReopening(true);
    setAssignmentFeedback(null);
    setAssignmentWarning(null);

    const result = await reopenIssue({
      issue: {
        ...reopenTarget,
        show_id: activeShow.id,
      },
      supabase,
    });

    if (result.error || !result.newStatus) {
      setAssignmentFeedback({
        type: "error",
        message: `Could not reopen issue: ${result.error?.message ?? "Unknown error."}`,
      });
      setIsReopening(false);
      return;
    }

    const issueId = reopenTarget.id;
    setReopenTarget(null);
    setExpandedStatuses((current) =>
      new Set(current).add(result.newStatus!),
    );
    setHighlightedIssueId(issueId);
    setAssignmentFeedback({
      type: "success",
      message: result.technicianName
        ? `${getTemporaryTechnicianLabel(result.technicianName)} retained. Issue returned to In Queue.`
        : "Issue reopened as New / Unassigned.",
    });
    setAssignmentWarning(
      result.historyError
        ? getHistoryWriteFailureMessage(result.historyError.message)
        : result.noticeError
          ? `Issue reopened, but technician notification failed: ${result.noticeError.message}`
          : null,
    );

    await Promise.all([
      refreshIssues(),
      refreshAssignments(),
      refreshAdditionalAssignments(),
      refreshIssueAssignmentHistory(),
    ]);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document
          .getElementById(`director-issue-${issueId}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });

    if (highlightTimeoutRef.current !== null) {
      window.clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedIssueId(null);
      highlightTimeoutRef.current = null;
    }, 3000);
    setIsReopening(false);
    playSuccess();
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
                    playWarning();
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
        {activeShow ? (
          <div className="mt-3 flex flex-col gap-1 rounded-lg border border-[#8b5cf6]/30 bg-[#17102c]/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a78bfa]">
                Technician Join Code
              </p>
              <p className="mt-1 text-xs text-[#94a3b8]">
                Reveal only when a technician is ready to join.
              </p>
            </div>
            <div className="group relative self-start sm:self-auto">
              <button
                aria-describedby="technician-join-code"
                className="rounded-md border border-white/10 bg-[#0d1324] px-3 py-2 text-xs font-semibold text-[#c4b5fd] transition hover:border-[#8b5cf6]/55 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a78bfa]"
                type="button"
              >
                Mouse Over For Join Code
              </button>
              <div
                className="invisible absolute right-0 top-full z-30 mt-2 grid min-w-56 translate-y-1 gap-3 rounded-lg border border-[#8b5cf6]/45 bg-[#070b18] p-4 text-center opacity-0 shadow-2xl shadow-black/70 transition duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100"
                id="technician-join-code"
                role="tooltip"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#94a3b8]">
                  Technician Join Code
                </p>
                <JoinCodeQr
                  className="mx-auto h-36 w-36"
                  code={activeShow.show_code}
                />
                <p className="mt-2 font-mono text-2xl font-bold tracking-[0.25em] text-white">
                  {activeShow.show_code ?? "Not assigned"}
                </p>
              </div>
            </div>
          </div>
        ) : null}
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {technicianOverview.map((technician) => (
            <TechOverviewCard
              chatUnreadCount={
                directorDirectChat.unreadByTechnician[
                  technician.id
                ] ?? 0
              }
              voiceMemoUnreadCount={
                directorDirectVoiceChat.unreadByTechnician[
                  technician.id
                ] ?? 0
              }
              currentIssue={technician.currentIssue}
              hasAttention={technician.hasAttention}
              hasUnreadCommunication={
                technician.hasUnreadCommunication
              }
              key={technician.id}
              loadCount={technician.activeIssues.length}
              now={timerNow}
              onOpenChat={() => {
                directorDirectChat.openChat(technician.id);
              }}
              onOpenVoiceMemos={() => {
                setDirectorAutoPlayVoiceMemoId(
                  directorDirectVoiceChat.latestUnreadByTechnician[
                    technician.id
                  ]?.id ?? null,
                );
                directorDirectVoiceChat.openPanel(technician.id);
              }}
              onOpenContextMenu={(x, y) =>
                openTechnicianContextMenu(
                  {
                    activeIssueCount: technician.activeIssues.length,
                    currentIssue:
                      technician.currentIssue?.issue ?? null,
                    technicianId: technician.id,
                    technicianName: technician.label,
                    unreadCount: technician.currentIssue
                      ? (directorDirectChat.unreadByTechnician[
                          technician.id
                        ] ?? 0)
                      : directorDirectChat.unreadByTechnician[
                            technician.id
                          ] ?? 0,
                  },
                  x,
                  y,
                )
              }
              queueCount={technician.queueCount}
              resolvedCount={technician.resolvedCount}
              technicianId={technician.id}
              technicianName={technician.label}
              workingCount={technician.workingCount}
            />
          ))}
        </div>
        {activeShow ? (
          <button
            className="mt-3 text-xs font-semibold text-[#c4b5fd] underline decoration-[#8b5cf6]/50 underline-offset-4 transition hover:text-white"
            onClick={() => setIsTechLocationMapOpen(true)}
            type="button"
          >
            View Tech Location Map
          </button>
        ) : null}
        {technicianRemovalTarget ? (
          <div className="mt-3 rounded-lg border border-[#ef4444]/35 bg-[#2a0b13]/85 p-3">
            <p className="text-sm font-semibold text-white">
              Remove {technicianRemovalTarget.name} from this session?
            </p>
            {technicianRemovalTarget.activeIssueCount > 0 ? (
              <p className="mt-2 text-xs font-semibold text-[#fecaca]">
                Reassign or resolve this technician&apos;s active issues before
                removing them.
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="rounded-md border border-white/15 px-3 py-2 text-xs font-semibold text-[#cbd5e1] transition hover:text-white"
                disabled={isRemovingTechnician}
                onClick={() => setTechnicianRemovalTarget(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-md border border-[#ef4444]/55 bg-[#7f1d1d] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#991b1b] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={
                  isRemovingTechnician ||
                  technicianRemovalTarget.activeIssueCount > 0
                }
                onClick={() => void confirmRemoveTechnician()}
                type="button"
              >
                Remove Technician
              </button>
            </div>
          </div>
        ) : null}
        {technicianContextMenu ? (
          <div
            className="fixed z-[70] w-64 overflow-hidden rounded-lg border border-white/15 bg-[#0b1020] p-1.5 shadow-2xl shadow-black/70"
            ref={technicianContextMenuRef}
            role="menu"
            style={{
              left: technicianContextMenu.x,
              top: technicianContextMenu.y,
            }}
          >
            <p className="truncate border-b border-white/10 px-3 py-2 text-xs font-semibold text-[#94a3b8]">
              {technicianContextMenu.technicianName}
            </p>
            <button
              className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm font-semibold text-[#e2e8f0] transition hover:bg-white/10 disabled:cursor-not-allowed disabled:text-[#64748b] disabled:hover:bg-transparent"
              disabled={!technicianContextMenu.currentIssue}
              onClick={viewTechnicianCurrentIssue}
              role="menuitem"
              type="button"
            >
              View Current Issue
            </button>
            <button
              className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm font-semibold text-[#bfdbfe] transition hover:bg-[#0b1b35] disabled:cursor-not-allowed disabled:text-[#64748b] disabled:hover:bg-transparent"
              onClick={openTechnicianIssueChat}
              role="menuitem"
              type="button"
            >
              <span>Open DM</span>
              {technicianContextMenu.unreadCount > 0 ? (
                <span className="flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#ef4444] px-1 text-[10px] font-bold text-white">
                  {technicianContextMenu.unreadCount > 99
                    ? "99+"
                    : technicianContextMenu.unreadCount}
                </span>
              ) : null}
            </button>
            <button
              className="flex w-full cursor-not-allowed items-center rounded-md px-3 py-2 text-left text-sm font-semibold text-[#64748b]"
              disabled
              role="menuitem"
              type="button"
            >
              View Tech Profile (coming soon)
            </button>
            <div className="my-1 border-t border-white/10" />
            <button
              className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm font-semibold text-[#fecaca] transition hover:bg-[#2a0b13]"
              onClick={requestTechnicianRemovalFromMenu}
              role="menuitem"
              type="button"
            >
              Remove Technician
            </button>
          </div>
        ) : null}
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
                  ? "Position and effect resolve from parsed script data when a matching row is available."
                  : "Position is optional for manual shows."}
              </p>
            </div>

            <div className="mt-6 grid gap-5">
              <div
                className={`grid gap-4 ${
                  !hasParsedScript &&
                  (isManual || showPositions.positions.length > 0)
                    ? "sm:grid-cols-2 xl:grid-cols-4"
                    : cueIsRequired
                      ? "sm:grid-cols-3"
                      : "sm:grid-cols-2"
                }`}
              >
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-[#dbe4ef]">
                    Issue Type
                  </span>
                  <select
                    className={fieldClassName}
                    onChange={(event) => {
                      const nextIssueType = event.target.value as IssueType;

                      setIssueType(nextIssueType);

                      if (!issueUsesCue(nextIssueType)) {
                        setCueValue("");
                      }
                    }}
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
                    <option value="low_battery">Low Battery</option>
                    <option value="poor_signal">Poor Signal</option>
                  </select>
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-[#dbe4ef]">
                    Channel
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
                {cueIsRequired ? (
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
                ) : null}
                {!hasParsedScript && showPositions.positions.length > 0 ? (
                  <label className="flex flex-col gap-2">
                    <span className="text-sm font-semibold text-[#dbe4ef]">
                      Position
                    </span>
                    <select
                      className={fieldClassName}
                      onChange={(event) =>
                        setSelectedPositionId(event.target.value)
                      }
                      value={selectedPositionId}
                    >
                      <option value="">No position / leave blank</option>
                      {showPositions.positions.map((position) => (
                        <option key={position.id} value={position.id}>
                          {position.groupId
                            ? positionGroupNames.get(position.groupId) ??
                              "Ungrouped"
                            : "Ungrouped"}{" "}
                          / {position.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : !hasParsedScript && isManual ? (
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
              </div>

              <div className="grid gap-3">
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-[#dbe4ef]">
                    Director Note{" "}
                    <span className="font-normal text-[#94a3b8]">
                      (optional)
                    </span>
                  </span>
                  <textarea
                    className={`${fieldClassName} min-h-24 resize-y font-normal leading-6`}
                    onChange={(event) =>
                      setDirectorNote(event.target.value)
                    }
                    placeholder="Optional note to the field tech"
                    value={directorNote}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  {cannedDirectorNotes.map((cannedNote) => (
                    <button
                      className="rounded-md border border-[#8b5cf6]/35 bg-[#1b1235] px-3 py-2 text-left text-xs font-semibold leading-5 text-[#d8c8ff] transition hover:border-[#a78bfa] hover:text-white"
                      key={cannedNote.label}
                      onClick={() => setDirectorNote(cannedNote.note)}
                      type="button"
                    >
                      {cannedNote.label}
                    </button>
                  ))}
                </div>
              </div>

              {hasParsedScript && channelNumber && issueType && (!cueIsRequired || cueValue.trim()) ? (
                cueIsRange ? (
                  <p className="rounded-lg border border-[#f59e0b]/40 bg-[#2a1c06] p-3 text-sm font-semibold text-[#fde68a]">
                    Script lookup supports single cues only for MVP.
                  </p>
                ) : scriptLookupState === "loading" ? (
                  <p className="rounded-lg border border-white/10 bg-[#070b18] p-3 text-sm font-semibold text-[#94a3b8]">
                    Looking up script event...
                  </p>
                ) : scriptLookupState === "error" ? (
                  <p className="rounded-lg border border-[#ef4444]/40 bg-[#2a0b13] p-3 text-sm font-semibold text-[#fecaca]">
                    Script event lookup failed. Check Supabase access and try
                    again.
                  </p>
                ) : resolvedScriptRow ? (
                  <div className="rounded-lg border border-[#22c55e]/35 bg-[#082515] p-3">
                    <p className="text-sm font-semibold text-[#bbf7d0]">
                      Script row resolved
                    </p>
                    <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-[#94a3b8]">Position</dt>
                        <dd className="font-semibold text-white">
                          {resolvedScriptRow.position_name ?? "Not provided"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[#94a3b8]">Effect</dt>
                        <dd className="font-semibold text-white">
                          {resolvedScriptRow.effect_name ?? "Not provided"}
                        </dd>
                      </div>
                    </dl>
                  </div>
                ) : scriptLookupState === "not_found" ? (
                  <p className="rounded-lg border border-[#f59e0b]/40 bg-[#2a1c06] p-3 text-sm font-semibold text-[#fde68a]">
                    No matching script row found for CH {channelNumber}
                    {cueIsRequired ? ` Cue ${cueValue.trim()}` : ""}.
                  </p>
                ) : null
              ) : null}

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
                  {latestIssue.effect_name ? (
                    <p className="mt-1 text-xs text-[#94a3b8]">
                      Effect: {latestIssue.effect_name}
                    </p>
                  ) : null}
                  {latestIssue.director_note ? (
                    <div className="mt-3 rounded-md border border-[#8b5cf6]/30 bg-[#130a2b]/70 px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#c4b5fd]">
                        Director Note
                      </p>
                      <p className="mt-1 text-xs leading-5 text-[#e9e3ff]">
                        {latestIssue.director_note}
                      </p>
                    </div>
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
                              className={`rounded-md border bg-[#070b18] px-3 py-2 text-xs text-[#dbe4ef] transition-all duration-300 hover:border-[#8b5cf6]/60 focus:outline-none ${
                                highlightedIssueId === issue.id
                                  ? "border-[#f59e0b] ring-2 ring-[#f59e0b]/70 shadow-[0_0_24px_rgba(245,158,11,0.35)]"
                                  : "border-white/10"
                              }`}
                              id={`director-issue-${issue.id}`}
                              key={issue.id}
                              tabIndex={-1}
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
                                <span className="flex shrink-0 items-center gap-2">
                                  {status === "new" ? (
                                    <select
                                      aria-label={`Assign technician to ${formatIssueLabel(issue.issue_type)} on channel ${issue.channel_number}`}
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
                                      {technicianOptions.map(
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
                                  ) : technicianAssignments[issue.id] &&
                                    !terminalStatuses.has(status) ? (
                                    <select
                                      aria-label={`Reassign ${formatIssueLabel(issue.issue_type)} on channel ${issue.channel_number}`}
                                      className="h-8 max-w-32 shrink-0 rounded-md border border-[#3b82f6]/40 bg-[#0b1b35] px-2 text-xs font-semibold text-white outline-none focus:border-[#60a5fa]"
                                      disabled={
                                        reassigningIssueId === issue.id
                                      }
                                      onChange={(event) => {
                                        const technicianId = event.target
                                          .value as TemporaryTechnicianId;

                                        if (
                                          technicianId !==
                                          technicianAssignments[issue.id]
                                        ) {
                                          void reassignTechnician(
                                            issue,
                                            technicianId,
                                          );
                                        }
                                      }}
                                      value={
                                        technicianAssignments[issue.id]
                                      }
                                    >
                                      {technicianOptions.map(
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
                              </span>
                              {issue.position_name ? (
                                <span className="mt-1 block text-[#94a3b8]">
                                  Position: {issue.position_name}
                                </span>
                              ) : null}
                              {issue.director_note ? (
                                <span className="mt-2 block rounded-md border border-[#8b5cf6]/25 bg-[#130a2b]/60 px-2.5 py-2">
                                  <span className="block text-[10px] font-bold uppercase tracking-[0.1em] text-[#c4b5fd]">
                                    Director Note
                                  </span>
                                  <span className="mt-1 block leading-5 text-[#e9e3ff]">
                                    {issue.director_note}
                                  </span>
                                </span>
                              ) : null}
                              {status === "new" ? (
                                <span className="mt-1 block text-[11px] italic text-[#94a3b8]">
                                  Suggestion:{" "}
                                  {assignmentSuggestions.get(issue.id) ??
                                    "No recommendation available"}
                                </span>
                              ) : null}
                              {latestIssueNotes[issue.id] ? (
                                <span className="mt-1 block text-[11px] italic text-[#aab4c3]">
                                  Note: {latestIssueNotes[issue.id]}
                                </span>
                              ) : null}
                              {REOPENABLE_ISSUE_STATUSES.has(
                                issue.status,
                              ) ? (
                                <button
                                  className="mt-2 rounded-md border border-[#f59e0b]/45 bg-[#2a1c06] px-3 py-2 text-xs font-bold text-[#fde68a] transition hover:border-[#fbbf24] hover:text-white"
                                  onClick={() => setReopenTarget(issue)}
                                  type="button"
                                >
                                  Reopen Issue
                                </button>
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
              {assignmentLoadError ? (
                <p className="mt-2 text-xs font-semibold leading-5 text-[#fecaca]">
                  Shared assignments could not be loaded:{" "}
                  {assignmentLoadError}
                </p>
              ) : null}
            </div>
          </aside>
        </section>
      )}
      <DirectorAttentionQueue onIssueUpdated={refreshIssues} />
      {activeShow && isTechLocationMapOpen ? (
        <DirectorTechLocationMap
          locations={technicianMapLocations}
          now={timerNow}
          onClose={() => setIsTechLocationMapOpen(false)}
          showId={activeShow.id}
        />
      ) : null}
      {duplicateIssue ? (
        <div
          aria-labelledby="duplicate-issue-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-5"
          role="dialog"
        >
          <div className="w-full max-w-md rounded-lg border border-[#f59e0b]/45 bg-[#0b1020] p-6 shadow-2xl shadow-black/50">
            <h2
              className="text-xl font-semibold text-white"
              id="duplicate-issue-title"
            >
              Issue Already Exists
            </h2>
            <p className="mt-4 text-base font-semibold text-[#fde68a]">
              <IssueIdentifiers
                channelNumber={duplicateIssue.issue.channel_number}
                cueValue={duplicateIssue.matchedCue}
                issueType={duplicateIssue.issue.issue_type}
              />
            </p>
            <dl className="mt-4 divide-y divide-white/10 text-sm">
              <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-2">
                <dt className="text-[#94a3b8]">Position:</dt>
                <dd className="font-semibold text-white">
                  {duplicateIssue.issue.position_name ?? "None"}
                </dd>
              </div>
              <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-2">
                <dt className="text-[#94a3b8]">Current Status:</dt>
                <dd className="font-semibold text-white">
                  {formatIssueLabel(duplicateIssue.issue.status)}
                </dd>
              </div>
              <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-2">
                <dt className="text-[#94a3b8]">Assigned To:</dt>
                <dd className="font-semibold text-white">
                  {duplicateIssue.technicianName
                    ? getTemporaryTechnicianLabel(
                        duplicateIssue.technicianName,
                      )
                    : "Not yet assigned to field tech."}
                </dd>
              </div>
            </dl>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                className="rounded-md border border-white/15 px-4 py-2 text-sm font-semibold text-[#cbd5e1]"
                onClick={() => setDuplicateIssue(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-[#6d28d9] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#7c3aed]"
                onClick={openDuplicateIssue}
                type="button"
              >
                Open Existing Issue
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {directorDirectChat.openTechnicianName ? (
        <DirectChatWindow
          error={directorDirectChat.error}
          issueContext={directorCommunicationIssue}
          isSending={directorDirectChat.isSending}
          messages={
            directorDirectChat.messagesByTechnician[
              directorDirectChat.openTechnicianName
            ] ?? []
          }
          onClose={directorDirectChat.closeChat}
          onSend={(body) =>
            directorDirectChat.sendMessage(
              directorDirectChat.openTechnicianName!,
              body,
            )
          }
          readerRole="director"
          readerTechnicianName={null}
          technicianName={directorDirectChat.openTechnicianName}
        />
      ) : null}
      {directorDirectVoiceChat.openTechnicianName ? (
        <DirectVoiceChatPanel
          autoPlayMemoId={
            directorDirectVoiceChat.autoPlayMemoId ??
            directorAutoPlayVoiceMemoId
          }
          error={directorDirectVoiceChat.error}
          issueContext={directorCommunicationIssue}
          isUploading={directorDirectVoiceChat.isUploading}
          memos={
            directorDirectVoiceChat.memosByTechnician[
              directorDirectVoiceChat.openTechnicianName
            ] ?? []
          }
          onMemoPlaybackStarted={
            directorDirectVoiceChat.markMemoPlayed
          }
          onClose={() => {
            setDirectorAutoPlayVoiceMemoId(null);
            directorDirectVoiceChat.closePanel();
          }}
          onUpload={(blob, durationMs, mimeType) =>
            directorDirectVoiceChat.uploadMemo(
              directorDirectVoiceChat.openTechnicianName!,
              blob,
              durationMs,
              mimeType,
            )
          }
          readerRole="director"
          readerTechnicianName={null}
          signedUrls={directorDirectVoiceChat.signedUrls}
          target={{
            technicianName:
              directorDirectVoiceChat.openTechnicianName,
          }}
          unreadMemoIds={
            directorDirectVoiceChat.unreadMemoIdsByTechnician[
              directorDirectVoiceChat.openTechnicianName
            ] ?? []
          }
        />
      ) : null}
      {reopenTarget ? (
        <div
          aria-labelledby="director-reopen-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-5"
          role="dialog"
        >
          <section className="w-full max-w-md rounded-lg border border-[#f59e0b]/45 bg-[#0b1020] p-6 shadow-2xl shadow-black/60">
            <h2
              className="text-xl font-semibold text-white"
              id="director-reopen-title"
            >
              Reopen Issue?
            </h2>
            <p className="mt-4 text-sm leading-6 text-[#dbe4ef]">
              Reopen <IssueIdentifiers
                channelNumber={reopenTarget.channel_number}
                cueValue={reopenTarget.cue_value}
                issueType={reopenTarget.issue_type}
              /> at{" "}
              <strong className="font-bold text-[#4ade80]">
                {reopenTarget.position_name ?? "None"}
              </strong>
              {"? This will return the issue to active work."}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                className="rounded-md border border-white/15 px-4 py-2 text-sm font-semibold text-[#cbd5e1]"
                disabled={isReopening}
                onClick={() => setReopenTarget(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-[#b45309] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                disabled={isReopening}
                onClick={() => void confirmReopenIssue()}
                type="button"
              >
                {isReopening ? "Reopening..." : "Reopen Issue"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
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
                  isLoadingSessionSummary
                }
                onClick={() => void handleEndSession()}
                type="button"
              >
                {isEndingSession ? "Closing..." : "Close Summary"}
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
  chatUnreadCount,
  currentIssue,
  hasAttention,
  hasUnreadCommunication,
  loadCount,
  now,
  onOpenChat,
  onOpenContextMenu,
  onOpenVoiceMemos,
  queueCount,
  resolvedCount,
  technicianId,
  technicianName,
  voiceMemoUnreadCount,
  workingCount,
}: {
  chatUnreadCount: number;
  currentIssue: {
    issue: IssueRecord;
    assignedAt: string | null;
  } | null;
  hasAttention: boolean;
  hasUnreadCommunication: boolean;
  loadCount: number;
  now: number | null;
  onOpenChat: () => void;
  onOpenContextMenu: (x: number, y: number) => void;
  onOpenVoiceMemos: () => void;
  queueCount: number;
  resolvedCount: number;
  technicianId: TemporaryTechnicianId;
  technicianName: string;
  voiceMemoUnreadCount: number;
  workingCount: number;
}) {
  const workloadClassName =
    loadCount >= 4
      ? "border-[#ef4444]/45 bg-[#2a0b13]"
      : workingCount > 0
        ? "border-[#3b82f6]/45 bg-[#0b1b35]"
        : loadCount > 0
        ? "border-[#f59e0b]/45 bg-[#2a1c06]"
        : "border-[#22c55e]/40 bg-[#082515]";

  return (
    <Link
      aria-label={`Open Technician Console as ${technicianName}`}
      className={`relative block cursor-pointer overflow-hidden rounded-lg border p-3 transition duration-150 hover:brightness-110 hover:shadow-[0_0_18px_rgba(167,139,250,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a78bfa] ${workloadClassName} ${
        hasUnreadCommunication
          ? "tech-overview-unread-communication"
          : hasAttention
            ? "tech-overview-attention-wiggle"
            : ""
      }`}
      href="/technician"
      onClick={() => setSelectedTemporaryTechnician(technicianId)}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpenContextMenu(event.clientX, event.clientY);
      }}
    >
      {hasAttention || hasUnreadCommunication ? (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 rounded-lg border-2 border-[#ef4444]/70 shadow-[inset_0_0_12px_rgba(239,68,68,0.22)] ${
            hasUnreadCommunication ? "animate-pulse" : ""
          }`}
        />
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <h2 className="min-w-0 truncate text-sm font-semibold text-white">
          {technicianName}
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-[#dbe4ef]">
            Load {loadCount}
          </span>
          <span
            className="inline-flex items-center gap-1"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <DirectChatButton
              compact
              onClick={onOpenChat}
              unreadCount={chatUnreadCount}
            />
            <DirectVoiceChatButton
              compact
              onClick={onOpenVoiceMemos}
              unreadCount={voiceMemoUnreadCount}
            />
          </span>
          <button
            aria-label={`Open actions for ${technicianName}`}
            className="rounded border border-white/15 bg-black/15 px-2 py-1 text-sm font-bold leading-none text-[#cbd5e1] transition hover:border-white/35 hover:text-white"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const bounds = event.currentTarget.getBoundingClientRect();
              onOpenContextMenu(bounds.right - 248, bounds.bottom + 6);
            }}
            title={`Open actions for ${technicianName}`}
            type="button"
          >
            More
          </button>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] font-semibold text-[#dbe4ef]">
        <span>Working {workingCount}</span>
        <span>Queue {queueCount}</span>
        <span>Resolved {resolvedCount}</span>
      </div>
      {currentIssue ? (
        <div className="mt-3 grid gap-1 border-t border-white/10 pt-2">
          <p className="truncate text-xs text-[#dbe4ef]">
            <span className="text-[#94a3b8]">Currently Working: </span>
            <IssueIdentifiers
              channelNumber={currentIssue.issue.channel_number}
              cueValue={currentIssue.issue.cue_value}
              issueType={currentIssue.issue.issue_type}
            />
          </p>
          <p className="truncate text-xs text-[#dbe4ef]">
            <span className="text-[#94a3b8]">Location: </span>
            <strong className="text-[#f28b82]">
              {currentIssue.issue.position_name ?? "None"}
            </strong>
          </p>
          <p className="font-mono text-xs font-semibold text-[#cbd5e1]">
            {formatElapsedTime(currentIssue.assignedAt, now)}
          </p>
        </div>
      ) : (
        <div className="mt-3 grid gap-1 border-t border-white/10 pt-2 text-xs">
          <p className="text-[#dbe4ef]">
            <span className="text-[#94a3b8]">Currently Working: </span>
            None
          </p>
          <p className="text-[#dbe4ef]">
            <span className="text-[#94a3b8]">Location: </span>
            <strong className="text-[#f28b82]">None</strong>
          </p>
        </div>
      )}
    </Link>
  );
}










