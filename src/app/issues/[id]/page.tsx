"use client";

import {
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  formatIssueLabel,
  getIssueStatusClassName,
  IssueIdentifiers,
} from "@/components/issue-identifiers";
import {
  getTemporaryTechnicianLabel,
  TEMPORARY_TECHNICIANS,
  type TemporaryTechnicianId,
} from "@/components/temporary-technician-store";
import { useActiveAdditionalTechnicianAssignments } from "@/components/collaboration-store";
import {
  assignIssueToTechnician,
  clearActiveIssueAssignment,
  useActiveIssueAssignments,
} from "@/components/issue-assignment-store";
import { getHistoryReadFailureMessage } from "@/lib/issue-status-history";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type IssueDetail = {
  id: string;
  channel_number: number;
  cue_value: string;
  issue_type: string;
  status: string;
  show_id: string;
  session_id: string | null;
  position_name: string | null;
  effect_name: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type LatestHistoryNote = {
  note: string | null;
  created_at: string | null;
};

type IssueHistoryRecord = {
  id: string;
  old_status: string | null;
  new_status: string;
  note: string | null;
  created_at: string | null;
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

export default function IssueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [issue, setIssue] = useState<IssueDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [assignmentMessage, setAssignmentMessage] = useState<string | null>(
    null,
  );
  const [latestHistoryNote, setLatestHistoryNote] =
    useState<LatestHistoryNote | null>(null);
  const [timeline, setTimeline] = useState<IssueHistoryRecord[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const assignmentSelectRef = useRef<HTMLSelectElement>(null);
  const {
    assignmentsByIssue,
    error: assignmentLoadError,
    refresh: refreshAssignments,
  } = useActiveIssueAssignments(issue?.show_id, issue?.session_id);
  const { assignmentsByIssue: additionalAssignments } =
    useActiveAdditionalTechnicianAssignments(
      issue?.show_id,
      issue?.session_id,
    );
  const savedAssignment = assignmentsByIssue[id];
  const additionalAssignment = additionalAssignments[id];

  const fetchIssue = useCallback(async () => {
    return supabase
      .from("issues")
      .select(
        "id, show_id, session_id, channel_number, cue_value, issue_type, status, position_name, effect_name, created_at, updated_at",
      )
      .eq("id", id)
      .maybeSingle();
  }, [id, supabase]);

  useEffect(() => {
    const loadIssue = async () => {
      const { data, error } = await fetchIssue();

      if (error) {
        setErrorMessage(`Could not load issue: ${error.message}`);
      } else if (!data) {
        setErrorMessage("Issue not found.");
      } else {
        setIssue(data as IssueDetail);

        const { data: historyData, error: timelineError } = await supabase
          .from("issue_status_history")
          .select("id, old_status, new_status, note, created_at")
          .eq("issue_id", id)
          .order("created_at", { ascending: true });

        if (timelineError) {
          setHistoryError(
            getHistoryReadFailureMessage(timelineError.message),
          );
        } else {
          const records = (historyData ?? []) as IssueHistoryRecord[];
          const latestNoteRecord = [...records]
            .reverse()
            .find((record) => record.note?.trim());

          setTimeline([...records].reverse());
          setLatestHistoryNote(
            latestNoteRecord
              ? {
                  note: latestNoteRecord.note,
                  created_at: latestNoteRecord.created_at,
                }
              : null,
          );
        }
      }

      setIsLoading(false);
    };

    void loadIssue();
  }, [fetchIssue, id, supabase]);

  const handleSaveAssignment = async () => {
    if (!issue) {
      return;
    }

    const selectedValue = assignmentSelectRef.current?.value ?? "";
    const technicianId =
      selectedValue === ""
        ? null
        : (selectedValue as TemporaryTechnicianId);

    const { error } = technicianId
      ? await assignIssueToTechnician({
          issueId: id,
          sessionId: issue.session_id,
          showId: issue.show_id,
          technicianId,
        })
      : await clearActiveIssueAssignment(id);

    if (error) {
      setAssignmentMessage(`Could not save assignment: ${error.message}`);
      return;
    }

    await refreshAssignments();
    setAssignmentMessage(
      technicianId
        ? `Shared assignment saved: ${getTemporaryTechnicianLabel(technicianId)}.`
        : "Shared assignment cleared.",
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-6 sm:px-8 lg:py-8">
      <section className="rounded-lg border border-white/10 bg-[#0b1020]/90 p-6 shadow-2xl shadow-black/25">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#a78bfa]">
          Issue Detail
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-white">
          Continuity issue
        </h1>
      </section>

      <section className="rounded-lg border border-white/10 bg-[#0b1020]/90 p-6 shadow-xl shadow-black/20">
        {isLoading ? (
          <p className="text-sm text-[#94a3b8]">Loading issue...</p>
        ) : errorMessage ? (
          <p className="rounded-lg border border-[#ef4444]/40 bg-[#2a0b13] p-4 text-sm font-semibold text-[#fecaca]">
            {errorMessage}
          </p>
        ) : issue ? (
          <div className="grid gap-6">
            <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-lg text-[#dbe4ef]">
                <IssueIdentifiers
                  channelNumber={issue.channel_number}
                  cueValue={issue.cue_value}
                  issueType={issue.issue_type}
                />
              </p>
              <span
                className={`w-fit rounded-lg border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${getIssueStatusClassName(issue.status)}`}
              >
                {formatIssueLabel(issue.status)}
              </span>
            </div>

            <section className="rounded-lg border border-[#8b5cf6]/30 bg-[#130a2b]/70 p-5">
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold text-white">
                  Assigned Technician
                </h2>
                <p className="text-sm leading-6 text-[#b6c3d1]">
                  Technician ownership is shared through Supabase for this
                  show and continuity session.
                </p>
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="grid flex-1 gap-2 text-sm font-semibold text-[#dbe4ef]">
                  Technician
                  <select
                    key={savedAssignment ?? "unassigned"}
                    ref={assignmentSelectRef}
                    defaultValue={savedAssignment ?? ""}
                    className="h-11 rounded-md border border-white/15 bg-[#070b18] px-3 text-base text-white outline-none transition focus:border-[#a78bfa] focus:ring-2 focus:ring-[#4c00a4]/40"
                  >
                    <option value="">Unassigned</option>
                    {TEMPORARY_TECHNICIANS.map((technician) => (
                      <option key={technician.id} value={technician.id}>
                        {technician.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => void handleSaveAssignment()}
                  className="h-11 rounded-md bg-[#6d28d9] px-5 text-sm font-semibold text-white transition hover:bg-[#7c3aed] focus:outline-none focus:ring-2 focus:ring-[#a78bfa] focus:ring-offset-2 focus:ring-offset-[#0b1020]"
                >
                  Save Assignment
                </button>
              </div>

              {assignmentMessage ? (
                <p className="mt-3 text-sm font-semibold text-[#c4b5fd]">
                  {assignmentMessage}
                </p>
              ) : (
                <p className="mt-3 text-xs text-[#94a3b8]">
                  Current shared assignment:{" "}
                  {getTemporaryTechnicianLabel(savedAssignment)}
                </p>
              )}
              {assignmentLoadError ? (
                <p className="mt-2 text-xs font-semibold text-[#fecaca]">
                  Could not load shared assignment: {assignmentLoadError}
                </p>
              ) : null}
            </section>

            <section className="rounded-lg border border-[#f59e0b]/30 bg-[#2a1c06]/55 p-5">
              <h2 className="text-lg font-semibold text-white">
                Latest Operational Note
              </h2>
              {historyError ? (
                <p className="mt-3 text-sm font-semibold leading-6 text-[#fde68a]">
                  {historyError}
                </p>
              ) : latestHistoryNote?.note ? (
                <>
                  <p className="mt-3 text-sm italic leading-6 text-[#e2e8f0]">
                    Note: {latestHistoryNote.note}
                  </p>
                  <p className="mt-2 text-xs text-[#94a3b8]">
                    {formatDateTime(latestHistoryNote.created_at)}
                  </p>
                </>
              ) : (
                <p className="mt-3 text-sm text-[#94a3b8]">
                  No operational note has been recorded.
                </p>
              )}
            </section>

            <dl className="grid gap-4 sm:grid-cols-2">
              <Detail label="Position" value={issue.position_name ?? "None"} />
              <Detail label="Effect" value={issue.effect_name ?? "None"} />
              <Detail
                label="Created At"
                value={formatDateTime(issue.created_at)}
              />
              <Detail
                label="Updated At"
                value={formatDateTime(issue.updated_at)}
              />
              <Detail
                label="Root Cause"
                value="Root cause documentation not implemented yet"
              />
            </dl>

            <section className="rounded-lg border border-white/10 bg-[#070b18] p-5">
              <div className="border-b border-white/10 pb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#a78bfa]">
                  Lifecycle
                </p>
                <h2 className="mt-1 text-xl font-semibold text-white">
                  Issue Timeline
                </h2>
              </div>

              <ol className="mt-5 grid gap-0">
                  {historyError ? (
                    <li className="ml-7 rounded-lg border border-[#f59e0b]/40 bg-[#2a1c06] p-4 text-sm font-semibold leading-6 text-[#fde68a]">
                      {historyError}
                    </li>
                  ) : timeline.map((record) => (
                    <li
                      className="relative grid grid-cols-[1rem_1fr] gap-3 pb-5 last:pb-0"
                      key={record.id}
                    >
                      <span className="absolute bottom-0 left-[0.4375rem] top-4 w-px bg-[#334155]" />
                      <span className="relative z-10 mt-1 h-4 w-4 rounded-full border-2 border-[#a78bfa] bg-[#130a2b]" />
                      <div className="rounded-lg border border-white/10 bg-[#0b1020] p-4">
                        <time className="text-xs font-semibold text-[#94a3b8]">
                          {formatDateTime(record.created_at)}
                        </time>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                          <span className="rounded-md border border-white/10 bg-[#111827] px-2 py-1 font-semibold text-[#cbd5e1]">
                            {record.old_status
                              ? formatIssueLabel(record.old_status)
                              : "Not Recorded"}
                          </span>
                          <span className="text-[#64748b]">to</span>
                          <span
                            className={`rounded-md border px-2 py-1 font-semibold ${getIssueStatusClassName(record.new_status)}`}
                          >
                            {formatIssueLabel(record.new_status)}
                          </span>
                        </div>
                        {record.note ? (
                          <p className="mt-3 text-sm italic leading-6 text-[#dbe4ef]">
                            Note: {record.note}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                  {!historyError && timeline.length === 0 ? (
                    <li className="ml-7 mb-5 rounded-lg border border-dashed border-white/15 p-4 text-sm text-[#94a3b8]">
                      No timeline history has been recorded for this issue yet.
                    </li>
                  ) : null}
                  <li className="relative grid grid-cols-[1rem_1fr] gap-3">
                    <span className="relative z-10 mt-1 h-4 w-4 rounded-full border-2 border-[#22c55e] bg-[#082515]" />
                    <div className="rounded-lg border border-[#22c55e]/30 bg-[#082515]/55 p-4">
                      <time className="text-xs font-semibold text-[#94a3b8]">
                        {formatDateTime(issue.created_at)}
                      </time>
                      <h3 className="mt-2 text-sm font-semibold text-white">
                        Issue Created
                      </h3>
                      <p className="mt-2 text-sm text-[#dbe4ef]">
                        <IssueIdentifiers
                          channelNumber={issue.channel_number}
                          cueValue={issue.cue_value}
                          issueType={issue.issue_type}
                        />
                      </p>
                      <p className="mt-2 text-xs text-[#cbd5e1]">
                        Initial status:{" "}
                        <strong>
                          {formatIssueLabel(
                            timeline[timeline.length - 1]?.old_status ??
                              "new",
                          )}
                        </strong>
                      </p>
                      {savedAssignment ? (
                        <p className="mt-1 text-xs text-[#cbd5e1]">
                          Assigned to:{" "}
                          <strong>
                            {getTemporaryTechnicianLabel(savedAssignment)}
                          </strong>
                        </p>
                      ) : null}
                      {additionalAssignment ? (
                        <p className="mt-1 text-xs text-[#c4b5fd]">
                          Additional technician:{" "}
                          <strong>
                            {getTemporaryTechnicianLabel(
                              additionalAssignment,
                            )}
                          </strong>
                        </p>
                      ) : null}
                    </div>
                  </li>
                </ol>
            </section>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#070b18] p-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">
        {label}
      </dt>
      <dd className="mt-2 text-sm font-semibold text-[#dbe4ef]">{value}</dd>
    </div>
  );
}
