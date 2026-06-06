"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import {
  formatIssueLabel,
  getIssueStatusClassName,
  IssueIdentifiers,
} from "@/components/issue-identifiers";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type IssueDetail = {
  id: string;
  channel_number: number;
  cue_value: string;
  issue_type: string;
  status: string;
  position_name: string | null;
  effect_name: string | null;
  created_at: string | null;
  updated_at: string | null;
  assigned_to_user_id: string | null;
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

  const fetchIssue = useCallback(async () => {
    return supabase
      .from("issues")
      .select(
        "id, channel_number, cue_value, issue_type, status, position_name, effect_name, created_at, updated_at, assigned_to_user_id",
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
      }

      setIsLoading(false);
    };

    void loadIssue();
  }, [fetchIssue]);

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
                label="Assigned Technician"
                value={
                  issue.assigned_to_user_id
                    ? "Assigned technician details coming later"
                    : "Unassigned"
                }
              />
              <Detail
                label="Root Cause"
                value="Root cause documentation not implemented yet"
              />
            </dl>
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
