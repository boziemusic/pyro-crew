"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useActiveShow } from "@/components/active-show-strip";
import {
  formatIssueLabel,
  ISSUE_IDENTIFIER_VALUE_CLASS_NAME,
  IssueIdentifiers,
} from "@/components/issue-identifiers";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import {
  REOPENABLE_ISSUE_STATUSES,
  reopenIssue,
} from "@/lib/reopen-issue";

type IssueRecord = {
  id: string;
  show_id: string;
  session_id: string | null;
  issue_source: string;
  issue_type: string;
  status: string;
  channel_number: number;
  cue_value: string;
  position_name: string | null;
  created_at: string | null;
};

type IssueView = "open" | "resolved" | "unfixable";

const issueViews: { id: IssueView; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "resolved", label: "Resolved" },
  { id: "unfixable", label: "Unfixable" },
];

function formatCreatedAt(createdAt: string | null) {
  if (!createdAt) {
    return "Creation time unavailable";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(createdAt));
}

export default function IssuesPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const activeShow = useActiveShow();
  const [issues, setIssues] = useState<IssueRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<IssueView>("open");
  const [reopenTarget, setReopenTarget] = useState<IssueRecord | null>(
    null,
  );
  const [isReopening, setIsReopening] = useState(false);
  const [highlightedIssueId, setHighlightedIssueId] = useState<
    string | null
  >(null);
  const highlightTimeoutRef = useRef<number | null>(null);

  const fetchIssues = useCallback(async () => {
    if (!activeShow) {
      return { data: [], error: null };
    }

    return supabase
      .from("issues")
      .select(
        "id, show_id, session_id, issue_source, issue_type, status, channel_number, cue_value, position_name, created_at",
      )
      .eq("show_id", activeShow.id)
      .order("created_at", { ascending: false });
  }, [activeShow, supabase]);

  const loadIssues = async () => {
    setIsLoading(true);
    setErrorMessage(null);

    const { data, error } = await fetchIssues();

    if (error) {
      setIssues([]);
      setErrorMessage(`Could not load issues: ${error.message}`);
    } else {
      setIssues((data ?? []) as IssueRecord[]);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    const loadInitialIssues = async () => {
      const { data, error } = await fetchIssues();

      if (error) {
        setIssues([]);
        setErrorMessage(`Could not load issues: ${error.message}`);
      } else {
        setIssues((data ?? []) as IssueRecord[]);
      }

      setIsLoading(false);
    };

    void loadInitialIssues();
  }, [fetchIssues]);

  useEffect(
    () => () => {
      if (highlightTimeoutRef.current !== null) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
    },
    [],
  );

  const visibleIssues = useMemo(() => {
    if (activeView === "resolved") {
      return issues.filter((issue) =>
        ["verified_resolved", "closed"].includes(issue.status),
      );
    }

    if (activeView === "unfixable") {
      return issues.filter((issue) => issue.status === "unfixable");
    }

    return issues.filter(
      (issue) =>
        !["verified_resolved", "closed", "unfixable"].includes(
          issue.status,
        ),
    );
  }, [activeView, issues]);

  const confirmReopenIssue = async () => {
    if (!reopenTarget) {
      return;
    }

    setIsReopening(true);
    setErrorMessage(null);
    const result = await reopenIssue({
      issue: reopenTarget,
      supabase,
    });

    if (result.error || !result.newStatus) {
      setErrorMessage(
        `Could not reopen issue: ${result.error?.message ?? "Unknown error."}`,
      );
      setIsReopening(false);
      return;
    }

    const issueId = reopenTarget.id;
    setIssues((currentIssues) =>
      currentIssues.map((issue) =>
        issue.id === issueId
          ? { ...issue, status: result.newStatus! }
          : issue,
      ),
    );
    setReopenTarget(null);
    setActiveView("open");
    setHighlightedIssueId(issueId);

    if (result.historyError) {
      setErrorMessage(
        `Issue reopened, but status history was not recorded: ${result.historyError.message}`,
      );
    } else if (result.noticeError) {
      setErrorMessage(
        `Issue reopened, but technician notification failed: ${result.noticeError.message}`,
      );
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document
          .getElementById(`issues-page-issue-${issueId}`)
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
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 sm:px-8 lg:py-8">
      <section className="rounded-lg border border-white/10 bg-[#0b1020]/90 p-6 shadow-2xl shadow-black/25">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#a78bfa]">
          Issues
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-normal text-white sm:text-4xl">
          Continuity issue tracking
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-[#b6c3d1]">
          Issues for {activeShow?.name ?? "the active show"}, newest first.
        </p>
      </section>

      <section className="rounded-lg border border-white/10 bg-[#0b1020]/90 p-6 shadow-xl shadow-black/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Issue list</h2>
            <div className="mt-3 flex gap-2" aria-label="Issue view">
              {issueViews.map((view) => (
                <button
                  className={`rounded-md border px-3 py-2 text-sm font-semibold transition-colors ${
                    activeView === view.id
                      ? "border-[#8b5cf6] bg-[#4c00a4] text-white"
                      : "border-white/10 bg-[#070b18] text-[#94a3b8] hover:text-white"
                  }`}
                  key={view.id}
                  onClick={() => setActiveView(view.id)}
                  type="button"
                >
                  {view.label}
                </button>
              ))}
            </div>
          </div>
          <button
            className="rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-[#dbe4ef] transition-colors hover:border-[#8b5cf6] hover:text-white"
            onClick={() => void loadIssues()}
            type="button"
          >
            Refresh
          </button>
        </div>

        {errorMessage ? (
          <p className="mt-5 rounded-lg border border-[#ef4444]/40 bg-[#2a0b13] p-4 text-sm font-semibold text-[#fecaca]">
            {errorMessage}
          </p>
        ) : null}

        <div className="mt-5 grid gap-3">
          {isLoading ? (
            <p className="rounded-lg border border-dashed border-[#475569] bg-[#070b18] p-5 text-sm text-[#94a3b8]">
              Loading issues from Supabase...
            </p>
          ) : visibleIssues.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[#475569] bg-[#070b18] p-5 text-sm text-[#94a3b8]">
              No {activeView} issues found for the active show.
            </p>
          ) : (
            visibleIssues.map((issue) => (
              <article
                className={`rounded-lg border bg-[#070b18] p-5 transition-all hover:border-[#8b5cf6]/60 hover:bg-[#0b1020] ${
                  highlightedIssueId === issue.id
                    ? "border-[#f59e0b] ring-2 ring-[#f59e0b]/70 shadow-[0_0_24px_rgba(245,158,11,0.35)]"
                    : "border-white/10"
                }`}
                id={`issues-page-issue-${issue.id}`}
                key={issue.id}
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <Link
                    className="min-w-0 flex-1"
                    href={`/issues/${issue.id}`}
                  >
                    <p className="text-base text-[#dbe4ef]">
                      <IssueIdentifiers
                        channelNumber={issue.channel_number}
                        cueValue={issue.cue_value}
                        issueType={issue.issue_type}
                      />
                    </p>
                    {issue.position_name ? (
                      <p className="mt-2 text-sm text-[#cbd5e1]">
                        Position: {issue.position_name}
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs text-[#64748b]">
                      {formatCreatedAt(issue.created_at)}
                    </p>
                  </Link>
                  <div className="flex shrink-0 flex-col items-start gap-2 md:items-end">
                    <span className="w-fit rounded-lg border border-[#4c00a4]/40 bg-[#130a2b] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#c4b5fd]">
                      {formatIssueLabel(issue.status)}
                    </span>
                    {REOPENABLE_ISSUE_STATUSES.has(issue.status) ? (
                      <button
                        className="rounded-md border border-[#f59e0b]/45 bg-[#2a1c06] px-3 py-2 text-xs font-bold text-[#fde68a] transition hover:border-[#fbbf24] hover:text-white"
                        onClick={() => setReopenTarget(issue)}
                        type="button"
                      >
                        Reopen Issue
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
      {reopenTarget ? (
        <div
          aria-labelledby="issues-reopen-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-5"
          role="dialog"
        >
          <section className="w-full max-w-md rounded-lg border border-[#f59e0b]/45 bg-[#0b1020] p-6 shadow-2xl shadow-black/60">
            <h2
              className="text-xl font-semibold text-white"
              id="issues-reopen-title"
            >
              Reopen Issue?
            </h2>
            <p className="mt-4 text-sm leading-6 text-[#dbe4ef]">
              Reopen <strong className="font-bold text-white">CH</strong>{" "}
              <strong className={ISSUE_IDENTIFIER_VALUE_CLASS_NAME}>
                {reopenTarget.channel_number}
              </strong>{" "}
              <span className="text-[#94a3b8]">|</span>{" "}
              <strong className="font-bold text-white">Cue(s)</strong>{" "}
              <strong className={ISSUE_IDENTIFIER_VALUE_CLASS_NAME}>
                {reopenTarget.cue_value}
              </strong>{" "}
              at{" "}
              <strong className="font-bold text-[#4ade80]">
                {reopenTarget.position_name ?? "—"}
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
    </div>
  );
}
