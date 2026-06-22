"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useActiveShow } from "@/components/active-show-strip";
import { useActiveContinuitySession } from "@/components/active-continuity-session";
import {
  setActiveIssueAssignmentAcknowledgedAt,
  useActiveIssueAssignments,
} from "@/components/issue-assignment-store";
import {
  formatIssueLabel,
  IssueIdentifiers,
} from "@/components/issue-identifiers";
import {
  getTemporaryTechnicianLabel,
  TEMPORARY_TECHNICIANS,
  type TemporaryTechnicianId,
} from "@/components/temporary-technician-store";
import {
  completeAdditionalTechnicianAssignments,
  createAdditionalTechnicianAssignment,
  createTechnicianNotice,
  useActiveAdditionalTechnicianAssignments,
  useJoinedSessionTechnicianNames,
} from "@/components/collaboration-store";
import { getHistoryWriteFailureMessage } from "@/lib/issue-status-history";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { purgeIssueVoiceMemos } from "@/components/issue-voice-memos";
import {
  playAdditionalTechRequested,
  playDirectorAttention,
  playSuccess,
  playVerificationRequested,
  playWarning,
} from "@/lib/app-feedback";

type AttentionStatus =
  | "awaiting_verification"
  | "director_assistance_requested"
  | "additional_technician_requested";

type AttentionIssue = {
  id: string;
  channel_number: number;
  cue_value: string;
  issue_type: string;
  position_name: string | null;
  effect_name: string | null;
  status: AttentionStatus;
  created_at: string | null;
  attention_entered_at: string | null;
  latest_note: string | null;
};

type FollowUpAction =
  | "decline_additional_technician"
  | "not_fixed"
  | "not_fixed_retrieving_parts"
  | "not_fixed_unfixable"
  | "retrieving_parts"
  | "unfixable";

type AttentionHistory = {
  issue_id: string;
  new_status: string;
  note: string | null;
  created_at: string | null;
};

type PinnedIssue = {
  id: string;
  index: number;
};

const attentionStatuses: AttentionStatus[] = [
  "awaiting_verification",
  "director_assistance_requested",
  "additional_technician_requested",
];

const cardStyles: Record<AttentionStatus, string> = {
  awaiting_verification:
    "border-[#f59e0b]/55 bg-[#211605]/95 shadow-[#f59e0b]/10",
  director_assistance_requested:
    "border-[#3b82f6]/55 bg-[#071a32]/95 shadow-[#3b82f6]/10",
  additional_technician_requested:
    "border-[#8b5cf6]/55 bg-[#190e32]/95 shadow-[#8b5cf6]/10",
};

const statusLabels: Record<AttentionStatus, string> = {
  awaiting_verification: "Awaiting Verification",
  director_assistance_requested: "Director Assistance Req",
  additional_technician_requested: "Additional Technician",
};

function getDirectorReturnNoticeType({
  newStatus,
  notFixedNote,
}: {
  newStatus: string;
  notFixedNote: string | null;
}) {
  if (newStatus === "verified_resolved" || newStatus === "closed") {
    return "verification_passed";
  }

  if (newStatus === "retrieving_parts") {
    return "retrieving_parts";
  }

  if (newStatus === "unfixable") {
    return "unfixable";
  }

  if (notFixedNote) {
    return "verification_failed";
  }

  return "director_response";
}

export function DirectorAttentionQueue({
  onIssueUpdated,
}: {
  onIssueUpdated?: () => Promise<void>;
}) {
  const activeShow = useActiveShow();
  const activeSession = useActiveContinuitySession();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { assignmentsByIssue: assignments } = useActiveIssueAssignments(
    activeShow?.id,
    activeSession && activeSession.show_id === activeShow?.id
      ? activeSession.id
      : null,
  );
  const {
    assignmentsByIssue: additionalAssignments,
    refresh: refreshAdditionalAssignments,
  } = useActiveAdditionalTechnicianAssignments(
    activeShow?.id,
    activeSession && activeSession.show_id === activeShow?.id
      ? activeSession.id
      : null,
  );
  const { technicianNames: joinedTechnicianNames } =
    useJoinedSessionTechnicianNames(
      activeShow?.id,
      activeSession && activeSession.show_id === activeShow?.id
        ? activeSession.id
        : null,
    );
  const [issues, setIssues] = useState<AttentionIssue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeAction, setActiveAction] = useState<{
    issueId: string;
    action: FollowUpAction;
  } | null>(null);
  const [note, setNote] = useState("");
  const [noteValidation, setNoteValidation] = useState<string | null>(null);
  const [updatingIssueId, setUpdatingIssueId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [historyWarning, setHistoryWarning] = useState<string | null>(null);
  const [pinnedIssue, setPinnedIssue] = useState<PinnedIssue | null>(null);
  const pinnedIssueRef = useRef<PinnedIssue | null>(null);
  const attentionSnapshotRef = useRef<Map<string, AttentionStatus> | null>(
    null,
  );

  useEffect(() => {
    attentionSnapshotRef.current = null;
  }, [activeShow?.id]);

  const updatePinnedIssue = useCallback((nextPin: PinnedIssue | null) => {
    pinnedIssueRef.current = nextPin;
    setPinnedIssue(nextPin);
  }, []);

  const applyQueueData = useCallback(
    (nextIssues: AttentionIssue[]) => {
      const nextSnapshot = new Map(
        nextIssues.map((issue) => [issue.id, issue.status]),
      );
      const previousSnapshot = attentionSnapshotRef.current;

      if (previousSnapshot) {
        const newAttentionItems = nextIssues.filter(
          (issue) =>
            !previousSnapshot.has(issue.id) ||
            previousSnapshot.get(issue.id) !== issue.status,
        );

        if (
          newAttentionItems.some(
            (issue) => issue.status === "awaiting_verification",
          )
        ) {
          playVerificationRequested();
        }
        if (
          newAttentionItems.some(
            (issue) => issue.status === "director_assistance_requested",
          )
        ) {
          playDirectorAttention();
        }
        if (
          newAttentionItems.some(
            (issue) =>
              issue.status === "additional_technician_requested",
          )
        ) {
          playAdditionalTechRequested();
        }
      }

      attentionSnapshotRef.current = nextSnapshot;
      const pin = pinnedIssueRef.current;

      if (!pin) {
        setIssues(nextIssues);
        return;
      }

      const pinnedCard = nextIssues.find((issue) => issue.id === pin.id);

      if (!pinnedCard) {
        updatePinnedIssue(null);
        setIssues(nextIssues);
        return;
      }

      const orderedIssues = nextIssues.filter(
        (issue) => issue.id !== pin.id,
      );
      orderedIssues.splice(
        Math.min(pin.index, orderedIssues.length),
        0,
        pinnedCard,
      );
      setIssues(orderedIssues);
    },
    [updatePinnedIssue],
  );

  const fetchQueue = useCallback(async () => {
    if (!activeShow) {
      return { data: [], error: null };
    }

    const { data, error } = await supabase
      .from("issues")
      .select(
        "id, channel_number, cue_value, issue_type, position_name, effect_name, status, created_at",
      )
      .eq("show_id", activeShow.id)
      .in("status", attentionStatuses);

    if (error || !data?.length) {
      return { data: data ?? [], error };
    }

    const issueIds = data.map((issue) => issue.id);
    const { data: historyData, error: historyError } = await supabase
      .from("issue_status_history")
      .select("issue_id, new_status, note, created_at")
      .in("issue_id", issueIds)
      .order("created_at", { ascending: false });

    if (historyError) {
      return { data: [], error: historyError };
    }

    const histories = (historyData ?? []) as AttentionHistory[];
    const queueIssues = data
      .map((issue) => {
        const currentEntry = histories.find(
          (history) =>
            history.issue_id === issue.id &&
            history.new_status === issue.status,
        );
        const latestNote = histories.find(
          (history) => history.issue_id === issue.id && history.note,
        );

        return {
          ...issue,
          attention_entered_at:
            currentEntry?.created_at ?? issue.created_at ?? null,
          latest_note: latestNote?.note ?? null,
        } as AttentionIssue;
      })
      .sort((left, right) => {
        const leftTime = left.attention_entered_at
          ? new Date(left.attention_entered_at).getTime()
          : 0;
        const rightTime = right.attention_entered_at
          ? new Date(right.attention_entered_at).getTime()
          : 0;

        return leftTime - rightTime;
      });

    return { data: queueIssues, error: null };
  }, [activeShow, supabase]);

  const refreshQueue = useCallback(async () => {
    const { data, error } = await fetchQueue();

    if (error) {
      setFeedback(`Queue refresh failed: ${error.message}`);
      return;
    }

    applyQueueData((data ?? []) as AttentionIssue[]);
  }, [applyQueueData, fetchQueue]);

  useEffect(() => {
    const loadQueue = async () => {
      const { data, error } = await fetchQueue();

      if (error) {
        setFeedback(`Queue load failed: ${error.message}`);
      } else {
        applyQueueData((data ?? []) as AttentionIssue[]);
      }

      setIsLoading(false);
    };

    void loadQueue();
    const intervalId = window.setInterval(() => {
      void refreshQueue();
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [applyQueueData, fetchQueue, refreshQueue]);

  const transitionIssue = async (
    issue: AttentionIssue,
    newStatus: string,
    transitionNote: string | null = null,
    closeAsUnfixable = false,
    notFixedNote: string | null = null,
    noticeTypeOverride: string | null = null,
  ) => {
    setUpdatingIssueId(issue.id);
    setFeedback(null);
    setHistoryWarning(null);

    if (newStatus === "retrieving_parts") {
      const { error: assignmentError } =
        await setActiveIssueAssignmentAcknowledgedAt(issue.id, null);

      if (assignmentError) {
        setFeedback(
          `Could not return issue to technician: ${assignmentError.message}`,
        );
        setUpdatingIssueId(null);
        return false;
      }
    }

    const updates: { status: string; closed_at?: string } = {
      status: newStatus,
    };

    if (closeAsUnfixable) {
      updates.closed_at = new Date().toISOString();
    }

    const { error: updateError } = await supabase
      .from("issues")
      .update(updates)
      .eq("id", issue.id)
      .eq("show_id", activeShow?.id ?? "");

    if (updateError) {
      setFeedback(`Status update failed: ${updateError.message}`);
      setUpdatingIssueId(null);
      return false;
    }

    const remainsInAttention = attentionStatuses.includes(
      newStatus as AttentionStatus,
    );

    if (remainsInAttention) {
      const currentIndex = issues.findIndex(
        (currentIssue) => currentIssue.id === issue.id,
      );
      updatePinnedIssue({
        id: issue.id,
        index: Math.max(currentIndex, 0),
      });
      setIssues((currentIssues) =>
        currentIssues.map((currentIssue) =>
          currentIssue.id === issue.id
            ? {
                ...currentIssue,
                status: newStatus as AttentionStatus,
                latest_note:
                  transitionNote ??
                  (notFixedNote ? "Not Fixed" : currentIssue.latest_note),
              }
            : currentIssue,
        ),
      );
    } else if (pinnedIssueRef.current?.id === issue.id) {
      updatePinnedIssue(null);
    }

    const notFixedHistoryNote = notFixedNote ? "Not Fixed" : null;
    const historyRows: {
      changed_by_user_id: null;
      issue_id: string;
      new_status: string;
      note: string | null;
      old_status: string;
    }[] = notFixedHistoryNote
      ? [
          {
            changed_by_user_id: null,
            issue_id: issue.id,
            new_status: "verification_failed",
            note: notFixedHistoryNote,
            old_status: issue.status,
          },
          {
            changed_by_user_id: null,
            issue_id: issue.id,
            new_status: newStatus,
            note: transitionNote
              ? `${notFixedHistoryNote}. ${transitionNote}`
              : notFixedHistoryNote,
            old_status: "verification_failed",
          },
        ]
      : [
          {
            changed_by_user_id: null,
            issue_id: issue.id,
            new_status: newStatus,
            note: transitionNote,
            old_status: issue.status,
          },
        ];
    const { error: historyError } = await supabase
      .from("issue_status_history")
      .insert(historyRows);

    if (historyError) {
      setFeedback(`Issue moved to ${formatIssueLabel(newStatus)}.`);
      setHistoryWarning(
        getHistoryWriteFailureMessage(historyError.message),
      );
    } else {
      setFeedback(`Issue moved to ${formatIssueLabel(newStatus)}.`);
      if (
        newStatus === "verified_resolved" ||
        newStatus === "closed"
      ) {
        playSuccess();
      } else if (
        newStatus === "verification_failed" ||
        notFixedHistoryNote
      ) {
        playWarning();
      }
    }

    const primaryTechnician = assignments[issue.id];
    const isResolution =
      newStatus === "verified_resolved" ||
      newStatus === "closed" ||
      newStatus === "unfixable";

    if (primaryTechnician && activeShow) {
      const noticeRecipients = new Set<TemporaryTechnicianId>([
        primaryTechnician,
      ]);
      const additionalTechnician = additionalAssignments[issue.id];

      if (additionalTechnician) {
        noticeRecipients.add(additionalTechnician);
      }

      const noticeResults = await Promise.all(
        [...noticeRecipients].map((technicianId) =>
          createTechnicianNotice({
            issueId: issue.id,
            message:
              notFixedNote && !transitionNote?.trim()
                ? null
                : transitionNote?.trim() || null,
            noticeType:
              noticeTypeOverride ??
              getDirectorReturnNoticeType({
                newStatus,
                notFixedNote,
              }),
            sessionId:
              activeSession?.show_id === activeShow.id
                ? activeSession.id
                : null,
            showId: activeShow.id,
            technicianId,
            title: isResolution
              ? `Issue ${formatIssueLabel(newStatus)}`
              : `Director Response: ${formatIssueLabel(newStatus)}`,
          }),
        ),
      );
      const noticeError = noticeResults.find(
        (result) => result.error,
      )?.error;

      if (noticeError) {
        setHistoryWarning(
          `Issue updated, but technician notice failed: ${noticeError.message}`,
        );
      }
    }

    if (isResolution) {
      await completeAdditionalTechnicianAssignments(issue.id);
      await refreshAdditionalAssignments();
    }

    if (
      newStatus === "verified_resolved" ||
      newStatus === "unfixable"
    ) {
      const { error: voiceMemoCleanupError } =
        await purgeIssueVoiceMemos(supabase, {
          issueId: issue.id,
        });

      if (voiceMemoCleanupError) {
        setHistoryWarning(
          `Issue updated, but temporary voice chat could not be cleared: ${voiceMemoCleanupError.message}`,
        );
      }
    }

    setActiveAction(null);
    setNote("");
    setNoteValidation(null);
    await refreshQueue();
    await onIssueUpdated?.();
    setUpdatingIssueId(null);
    return true;
  };

  const assignAdditionalTechnician = async (
    issue: AttentionIssue,
    technicianId: TemporaryTechnicianId,
  ) => {
    if (!activeShow) {
      return;
    }

    const primaryTechnician = assignments[issue.id];
    if (!primaryTechnician) {
      setFeedback("Assign a primary technician before adding help.");
      return;
    }

    const technicianLabel = getTemporaryTechnicianLabel(technicianId);
    const primaryTechnicianLabel =
      getTemporaryTechnicianLabel(primaryTechnician);
    const additionalTechnicianNote = `Additional technician ${technicianLabel} assigned to help ${primaryTechnicianLabel}.`;
    const { error: assignmentError } =
      await createAdditionalTechnicianAssignment({
        additionalTechnicianId: technicianId,
        directorNote: additionalTechnicianNote,
        issueId: issue.id,
        primaryTechnicianId: primaryTechnician,
        requestedNote: issue.latest_note,
        sessionId:
          activeSession?.show_id === activeShow.id
            ? activeSession.id
            : null,
        showId: activeShow.id,
      });

    if (assignmentError) {
      setFeedback(
        `Could not assign additional technician: ${assignmentError.message}`,
      );
      return;
    }

    const wasUpdated = await transitionIssue(
      issue,
      "in_progress",
      issue.latest_note?.startsWith("Not Fixed")
        ? `${issue.latest_note} ${additionalTechnicianNote}`
        : additionalTechnicianNote,
      false,
      null,
      null,
    );

    if (!wasUpdated) {
      await completeAdditionalTechnicianAssignments(issue.id);
      await refreshAdditionalAssignments();
      return;
    }

    if (wasUpdated) {
      const sessionId =
        activeSession?.show_id === activeShow.id
          ? activeSession.id
          : null;
      const noticeResults = await Promise.all([
        createTechnicianNotice({
          issueId: issue.id,
          message: additionalTechnicianNote,
          noticeType: "additional_help_assigned",
          sessionId,
          showId: activeShow.id,
          technicianId,
          title: "Additional Technician Assignment",
        }),
        createTechnicianNotice({
          issueId: issue.id,
          message: additionalTechnicianNote,
          noticeType: "additional_tech_approved",
          sessionId,
          showId: activeShow.id,
          technicianId: primaryTechnician,
          title: "Additional Technician Approved",
        }),
      ]);
      const noticeError = noticeResults.find((result) => result.error)?.error;
      await refreshAdditionalAssignments();
      setFeedback("Additional Tech Assigned");
      if (noticeError) {
        setHistoryWarning(
          `Assignment saved, but a technician notice failed: ${noticeError.message}`,
        );
      }
    }
  };

  const openAction = (issueId: string, action: FollowUpAction) => {
    setActiveAction({ issueId, action });
    setNote("");
    setNoteValidation(null);
    setFeedback(null);
  };

  if (!activeShow) {
    return null;
  }

  return (
    <aside className="fixed bottom-5 right-[max(1.25rem,calc((100vw-96rem)/2))] top-36 z-10 hidden w-80 flex-col overflow-hidden rounded-lg border border-white/10 bg-[#070b18]/95 shadow-2xl shadow-black/40 backdrop-blur xl:flex">
      <div className="border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-white">
            Director Attention Queue
          </h2>
          <span className="rounded-md bg-[#4c00a4] px-2 py-1 text-xs font-bold text-white">
            {issues.length}
          </span>
        </div>
        <p className="mt-1 text-xs text-[#94a3b8]">Oldest request first</p>
      </div>

      {feedback ? (
        <p className="border-b border-white/10 bg-[#111827] px-4 py-2 text-xs font-semibold text-[#dbe4ef]">
          {feedback}
        </p>
      ) : null}
      {historyWarning ? (
        <p className="border-b border-[#f59e0b]/30 bg-[#2a1c06] px-4 py-2 text-xs font-semibold leading-5 text-[#fde68a]">
          {historyWarning}
        </p>
      ) : null}

      <div className="grid flex-1 content-start gap-3 overflow-y-auto p-3">
        {isLoading ? (
          <p className="p-3 text-sm text-[#94a3b8]">Loading requests...</p>
        ) : issues.length === 0 ? (
          <p className="rounded-md border border-dashed border-white/15 p-4 text-center text-sm text-[#94a3b8]">
            No issues need Director attention.
          </p>
        ) : (
          issues.map((issue) => {
            const isUpdating = updatingIssueId === issue.id;
            const action = activeAction?.issueId === issue.id
              ? activeAction.action
              : null;
            const originalTechnician = getTemporaryTechnicianLabel(
              assignments[issue.id],
            );
            const additionalTechnician = additionalAssignments[issue.id];

            return (
              <article
                className={`rounded-lg border p-3 shadow-lg ${cardStyles[issue.status]} ${
                  pinnedIssue?.id === issue.id
                    ? "ring-1 ring-[#c4b5fd]/45"
                    : ""
                }`}
                key={issue.id}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-bold uppercase text-white">
                      {statusLabels[issue.status]}
                    </p>
                    <p className="mt-1 text-xs text-[#cbd5e1]">
                      {originalTechnician}
                    </p>
                  </div>
                  {pinnedIssue?.id === issue.id ? (
                    <span className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#c4b5fd]">
                      Updated
                    </span>
                  ) : null}
                </div>

                <p className="mt-3 text-sm text-[#e2e8f0]">
                  <IssueIdentifiers
                    channelNumber={issue.channel_number}
                    cueValue={issue.cue_value}
                    issueType={issue.issue_type}
                  />
                </p>
                {issue.position_name ? (
                  <p className="mt-1 text-xs text-[#cbd5e1]">
                    Position: {issue.position_name}
                  </p>
                ) : null}
                {issue.effect_name ? (
                  <p className="mt-1 text-xs text-[#cbd5e1]">
                    Effect: {issue.effect_name}
                  </p>
                ) : null}
                {issue.latest_note ? (
                  <p className="mt-2 text-xs italic leading-5 text-[#dbe4ef]">
                    Note: {issue.latest_note}
                  </p>
                ) : null}

                {issue.status === "awaiting_verification" && !action ? (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      className="rounded-md border border-[#22c55e]/50 bg-[#0b3a21] px-2 py-2 text-xs font-bold text-[#bbf7d0] disabled:opacity-50"
                      disabled={isUpdating}
                      onClick={() =>
                        void transitionIssue(issue, "verified_resolved")
                      }
                      type="button"
                    >
                      CONFIRM FIXED
                    </button>
                    <button
                      className="rounded-md border border-[#f59e0b]/50 bg-[#3a2507] px-2 py-2 text-xs font-bold text-[#fde68a]"
                      onClick={() => openAction(issue.id, "not_fixed")}
                      type="button"
                    >
                      NOT FIXED
                    </button>
                  </div>
                ) : null}

                {((issue.status === "director_assistance_requested" &&
                  !action) ||
                  action === "not_fixed") ? (
                  <ActionChoices
                    disabled={isUpdating}
                    includeConfirmFixed={
                      issue.status === "director_assistance_requested"
                    }
                    issue={issue}
                    notFixed={action === "not_fixed"}
                    onOpenAction={openAction}
                    onTransition={transitionIssue}
                  />
                ) : null}

                {issue.status === "additional_technician_requested" ? (
                  <>
                    <AdditionalTechnicianControl
                      currentTechnician={additionalTechnician}
                      technicianOptions={
                        joinedTechnicianNames.length > 0
                          ? joinedTechnicianNames.map((name) => ({
                              id: name,
                              label: getTemporaryTechnicianLabel(name),
                            }))
                          : [...TEMPORARY_TECHNICIANS]
                      }
                      originalTechnician={assignments[issue.id]}
                      onAssign={(technicianId) =>
                        void assignAdditionalTechnician(issue, technicianId)
                      }
                    />
                    {!action ? (
                      <button
                        className="mt-2 text-left text-[11px] italic text-[#cbd5e1] underline decoration-white/25 underline-offset-2 transition hover:text-white"
                        onClick={() =>
                          openAction(
                            issue.id,
                            "decline_additional_technician",
                          )
                        }
                        type="button"
                      >
                        Decline request
                      </button>
                    ) : null}
                  </>
                ) : null}

                {action === "decline_additional_technician" ? (
                  <div className="mt-3 rounded-md border border-white/10 bg-black/20 p-3">
                    <label className="grid gap-2 text-xs font-semibold text-white">
                      Decline note to technician
                      <textarea
                        className="min-h-20 resize-y rounded-md border border-white/15 bg-[#020617] p-2 text-sm text-white outline-none focus:border-[#a78bfa]"
                        onChange={(event) => {
                          setNote(event.target.value);
                          setNoteValidation(null);
                        }}
                        placeholder="Required note"
                        value={note}
                      />
                    </label>
                    {noteValidation ? (
                      <p className="mt-2 text-xs font-semibold text-[#fecaca]">
                        {noteValidation}
                      </p>
                    ) : null}
                    <div className="mt-3 flex gap-2">
                      <button
                        className="flex-1 rounded-md border border-[#ef4444]/50 bg-[#2a0b13] px-2 py-2 text-xs font-bold text-[#fecaca] disabled:opacity-50"
                        disabled={isUpdating}
                        onClick={() => {
                          const declineNote = note.trim();

                          if (!declineNote) {
                            setNoteValidation(
                              "Add a note before declining this request.",
                            );
                            return;
                          }

                          void transitionIssue(
                            issue,
                            "assigned",
                            declineNote,
                            false,
                            null,
                            "additional_tech_declined",
                          );
                        }}
                        type="button"
                      >
                        DECLINE REQUEST
                      </button>
                      <button
                        className="rounded-md border border-white/15 px-2 py-2 text-xs font-semibold text-[#cbd5e1]"
                        onClick={() => {
                          setActiveAction(null);
                          setNote("");
                          setNoteValidation(null);
                        }}
                        type="button"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                {action === "retrieving_parts" ||
                action === "not_fixed_retrieving_parts" ||
                action === "unfixable" ||
                action === "not_fixed_unfixable" ? (
                  <div className="mt-3 rounded-md border border-white/10 bg-black/20 p-3">
                    <label className="grid gap-2 text-xs font-semibold text-white">
                      {action === "unfixable" ||
                      action === "not_fixed_unfixable"
                        ? "Why is this issue unfixable?"
                        : "Parts retrieval note"}
                      <textarea
                        className="min-h-20 resize-y rounded-md border border-white/15 bg-[#020617] p-2 text-sm text-white outline-none focus:border-[#a78bfa]"
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="Required note"
                        value={note}
                      />
                    </label>
                    {action === "unfixable" ||
                    action === "not_fixed_unfixable" ? (
                      <p className="mt-2 text-xs text-[#fecaca]">
                        Confirming marks this issue unfixable and closes it.
                      </p>
                    ) : null}
                    <div className="mt-3 flex gap-2">
                      <button
                        className="flex-1 rounded-md border border-[#ef4444]/50 bg-[#2a0b13] px-2 py-2 text-xs font-bold text-[#fecaca] disabled:opacity-50"
                        disabled={!note.trim() || isUpdating}
                        onClick={() =>
                          void transitionIssue(
                            issue,
                            action === "unfixable" ||
                              action === "not_fixed_unfixable"
                              ? "unfixable"
                              : "retrieving_parts",
                            note.trim(),
                            action === "unfixable" ||
                              action === "not_fixed_unfixable",
                            action === "not_fixed_unfixable" ||
                              action === "not_fixed_retrieving_parts"
                              ? "Not Fixed"
                              : null,
                          )
                        }
                        type="button"
                      >
                        {action === "unfixable" ||
                        action === "not_fixed_unfixable"
                          ? "CONFIRM UNFIXABLE"
                          : "SAVE & CONTINUE"}
                      </button>
                      <button
                        className="rounded-md border border-white/15 px-2 py-2 text-xs font-semibold text-[#cbd5e1]"
                        onClick={() => {
                          setActiveAction(null);
                          setNote("");
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
          })
        )}
      </div>
    </aside>
  );
}

function ActionChoices({
  disabled,
  includeConfirmFixed,
  issue,
  notFixed,
  onOpenAction,
  onTransition,
}: {
  disabled: boolean;
  includeConfirmFixed: boolean;
  issue: AttentionIssue;
  notFixed: boolean;
  onOpenAction: (issueId: string, action: FollowUpAction) => void;
  onTransition: (
    issue: AttentionIssue,
    status: string,
    note?: string | null,
    closeAsUnfixable?: boolean,
    notFixedNote?: string | null,
  ) => Promise<boolean>;
}) {
  return (
    <div className="mt-3 grid gap-1.5">
      <button
        className="rounded-md border border-[#3b82f6]/40 bg-[#0b1b35] px-2 py-2 text-xs font-semibold text-[#bfdbfe]"
        disabled={disabled}
        onClick={() =>
          void onTransition(
            issue,
            "in_progress",
            null,
            false,
            notFixed ? "Not Fixed" : null,
          )
        }
        type="button"
      >
        Still Working
      </button>
      <button
        className="rounded-md border border-[#f59e0b]/40 bg-[#2a1c06] px-2 py-2 text-xs font-semibold text-[#fde68a]"
        disabled={disabled}
        onClick={() =>
          onOpenAction(
            issue.id,
            notFixed ? "not_fixed_retrieving_parts" : "retrieving_parts",
          )
        }
        type="button"
      >
        Retrieving Parts
      </button>
      <button
        className="rounded-md border border-[#8b5cf6]/40 bg-[#1b1235] px-2 py-2 text-xs font-semibold text-[#d8c8ff]"
        disabled={disabled}
        onClick={() =>
          void onTransition(
            issue,
            "additional_technician_requested",
            null,
            false,
            notFixed ? "Not Fixed" : null,
          )
        }
        type="button"
      >
        Assign Additional Technician
      </button>
      {includeConfirmFixed ? (
        <button
          className="rounded-md border border-[#22c55e]/40 bg-[#082515] px-2 py-2 text-xs font-semibold text-[#bbf7d0]"
          disabled={disabled}
          onClick={() => void onTransition(issue, "verified_resolved")}
          type="button"
        >
          Confirm Fixed
        </button>
      ) : null}
      <button
        className="rounded-md border border-[#ef4444]/40 bg-[#2a0b13] px-2 py-2 text-xs font-semibold text-[#fecaca]"
        disabled={disabled}
        onClick={() =>
          onOpenAction(
            issue.id,
            notFixed ? "not_fixed_unfixable" : "unfixable",
          )
        }
        type="button"
      >
        Mark Unfixable
      </button>
    </div>
  );
}

function AdditionalTechnicianControl({
  currentTechnician,
  originalTechnician,
  onAssign,
  technicianOptions,
}: {
  currentTechnician: TemporaryTechnicianId | undefined;
  originalTechnician: TemporaryTechnicianId | undefined;
  onAssign: (technicianId: TemporaryTechnicianId) => void;
  technicianOptions: { id: TemporaryTechnicianId; label: string }[];
}) {
  const availableTechnicians = useMemo(
    () =>
      technicianOptions.filter(
        (technician) => technician.id !== originalTechnician,
      ),
    [originalTechnician, technicianOptions],
  );
  const [selectedTechnician, setSelectedTechnician] =
    useState<TemporaryTechnicianId | "">(
      currentTechnician && currentTechnician !== originalTechnician
        ? currentTechnician
        : "",
    );
  const selectedTechnicianIsValid = availableTechnicians.some(
    (technician) => technician.id === selectedTechnician,
  );
  const currentTechnicianIsValid =
    Boolean(currentTechnician) &&
    availableTechnicians.some(
      (technician) => technician.id === currentTechnician,
    );
  const selectedTechnicianValue = selectedTechnicianIsValid
    ? selectedTechnician
    : currentTechnicianIsValid
      ? currentTechnician
      : "";

  return (
    <div className="mt-3 rounded-md border border-white/10 bg-black/20 p-3">
      <p className="text-xs text-[#c4b5fd]">
        Temporary additional assignment. Original technician{" "}
        {getTemporaryTechnicianLabel(originalTechnician)} is preserved.
      </p>
      <select
        className="mt-2 h-9 w-full rounded-md border border-white/15 bg-[#020617] px-2 text-sm text-white outline-none focus:border-[#a78bfa]"
        onChange={(event) =>
          setSelectedTechnician(event.target.value as TemporaryTechnicianId)
        }
        value={selectedTechnicianValue}
      >
        <option value="">Select technician</option>
        {availableTechnicians.map((technician) => (
          <option key={technician.id} value={technician.id}>
            {technician.label}
          </option>
        ))}
      </select>
      <button
        className="mt-2 w-full rounded-md bg-[#6d28d9] px-2 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!selectedTechnicianValue}
        onClick={() => {
          if (selectedTechnicianValue) {
            onAssign(selectedTechnicianValue);
          }
        }}
        type="button"
      >
        Assign Additional Technician
      </button>
    </div>
  );
}
