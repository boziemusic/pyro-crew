"use client";

import {
  FormEvent,
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

export default function DirectorConsolePage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const activeShow = useActiveShow();
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
  const [expandedStatuses, setExpandedStatuses] = useState<Set<string>>(
    new Set(),
  );

  const fetchIssues = useCallback(async () => {
    if (!activeShow) {
      return { data: [], error: null };
    }

    return supabase
      .from("issues")
      .select(
        "id, channel_number, cue_value, issue_type, status, position_name, created_at",
      )
      .eq("show_id", activeShow.id)
      .order("created_at", { ascending: false });
  }, [activeShow, supabase]);

  const refreshIssues = useCallback(async () => {
    const { data, error } = await fetchIssues();

    if (error) {
      setIssueLoadError(`Could not refresh issue data: ${error.message}`);
      return;
    }

    setIssues((data ?? []) as IssueRecord[]);
    setIssueLoadError(null);
  }, [fetchIssues]);

  useEffect(() => {
    const loadInitialIssues = async () => {
      const { data, error } = await fetchIssues();

      if (error) {
        setIssues([]);
        setIssueLoadError(`Could not load issue data: ${error.message}`);
      } else {
        setIssues((data ?? []) as IssueRecord[]);
        setIssueLoadError(null);
      }

      setIsLoadingIssues(false);
    };

    void loadInitialIssues();
  }, [fetchIssues]);

  const statusGroups = useMemo(() => {
    const groups = new Map<string, IssueRecord[]>();

    issues.forEach((issue) => {
      groups.set(issue.status, [...(groups.get(issue.status) ?? []), issue]);
    });

    return statusOrder
      .map((status) => ({ issues: groups.get(status) ?? [], status }))
      .filter(({ issues: statusIssues }) => statusIssues.length > 0);
  }, [issues]);

  const latestIssue = issues[0] ?? null;

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
      session_id: null,
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
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 sm:px-8 lg:py-8">
      <section className="rounded-lg border border-white/10 bg-[#0b1020]/90 p-6 shadow-2xl shadow-black/25">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#a78bfa]">
          Director Console
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-normal text-white sm:text-4xl">
          Continuity Dispatch
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-[#b6c3d1]">
          Create continuity issues from firing system status for the active
          show and monitor field workload as new issues arrive.
        </p>
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
                            <Link
                              className="rounded-md border border-white/10 bg-[#070b18] px-3 py-2 text-xs text-[#dbe4ef] transition-colors hover:border-[#8b5cf6]/60"
                              href={`/issues/${issue.id}`}
                              key={issue.id}
                            >
                              <IssueIdentifiers
                                channelNumber={issue.channel_number}
                                cueValue={issue.cue_value}
                                issueType={issue.issue_type}
                              />
                              {issue.position_name ? (
                                <span className="mt-1 block text-[#94a3b8]">
                                  Position: {issue.position_name}
                                </span>
                              ) : null}
                            </Link>
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
            </div>
          </aside>
        </section>
      )}
    </div>
  );
}
