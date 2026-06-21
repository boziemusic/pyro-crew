import type { SupabaseClient } from "@supabase/supabase-js";

export const REOPENABLE_ISSUE_STATUSES = new Set([
  "verified_resolved",
  "closed",
  "unfixable",
]);

export const REOPEN_ISSUE_HISTORY_NOTE = "Issue reopened by Director.";

type ReopenableIssue = {
  id: string;
  session_id: string | null;
  show_id: string;
  status: string;
};

type AssignmentRow = {
  acknowledged_at: string | null;
  id: string;
  status: string;
  technician_name: string;
};

export async function reopenIssue({
  issue,
  supabase,
}: {
  issue: ReopenableIssue;
  supabase: SupabaseClient;
}) {
  if (!REOPENABLE_ISSUE_STATUSES.has(issue.status)) {
    return {
      error: new Error("Only resolved, closed, or unfixable issues can be reopened."),
      historyError: null,
      newStatus: null,
      noticeError: null,
      technicianName: null,
    };
  }

  const { data: assignmentData, error: assignmentLoadError } =
    await supabase
      .from("issue_assignments")
      .select("id, technician_name, status, acknowledged_at")
      .eq("issue_id", issue.id)
      .order("assigned_at", { ascending: false });

  if (assignmentLoadError) {
    return {
      error: assignmentLoadError,
      historyError: null,
      newStatus: null,
      noticeError: null,
      technicianName: null,
    };
  }

  const assignments = (assignmentData ?? []) as AssignmentRow[];
  let activeAssignment =
    assignments.find((assignment) => assignment.status === "active") ??
    null;
  let reactivatedAssignment: AssignmentRow | null = null;

  if (!activeAssignment && assignments[0]) {
    const mostRecentAssignment = assignments[0];
    const { error: reactivationError } = await supabase
      .from("issue_assignments")
      .update({
        acknowledged_at: null,
        status: "active",
        updated_at: new Date().toISOString(),
      })
      .eq("id", mostRecentAssignment.id)
      .neq("status", "active");

    if (reactivationError) {
      return {
        error: reactivationError,
        historyError: null,
        newStatus: null,
        noticeError: null,
        technicianName: null,
      };
    }

    activeAssignment = {
      ...mostRecentAssignment,
      status: "active",
    };
    reactivatedAssignment = mostRecentAssignment;
  }

  const newStatus = activeAssignment ? "assigned" : "new";
  const { data: updatedIssue, error: updateError } = await supabase
    .from("issues")
    .update({
      closed_at: null,
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", issue.id)
    .eq("show_id", issue.show_id)
    .eq("status", issue.status)
    .select("id")
    .maybeSingle();

  if (updateError || !updatedIssue) {
    if (reactivatedAssignment) {
      await supabase
        .from("issue_assignments")
        .update({
          acknowledged_at: reactivatedAssignment.acknowledged_at,
          status: reactivatedAssignment.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", reactivatedAssignment.id)
        .eq("status", "active");
    }

    return {
      error:
        updateError ??
        new Error("The issue status changed before it could be reopened."),
      historyError: null,
      newStatus: null,
      noticeError: null,
      technicianName: null,
    };
  }

  const { error: historyError } = await supabase
    .from("issue_status_history")
    .insert({
      changed_by_user_id: null,
      issue_id: issue.id,
      new_status: newStatus,
      note: REOPEN_ISSUE_HISTORY_NOTE,
      old_status: issue.status,
    });

  const noticeRecipients = new Set<string>();

  if (activeAssignment?.technician_name.trim()) {
    noticeRecipients.add(activeAssignment.technician_name.trim());
  }

  const { data: helperData, error: helperLoadError } = await supabase
    .from("additional_technician_assignments")
    .select("additional_technician_name")
    .eq("issue_id", issue.id)
    .eq("status", "active");

  if (!helperLoadError) {
    (helperData ?? []).forEach((helper) => {
      if (helper.additional_technician_name?.trim()) {
        noticeRecipients.add(helper.additional_technician_name.trim());
      }
    });
  }

  let noticeError = helperLoadError;

  if (noticeRecipients.size > 0) {
    const { error } = await supabase.from("technician_notices").insert(
      [...noticeRecipients].map((technicianName) => ({
        issue_id: issue.id,
        message: "The Director reopened this issue.",
        notice_type: "reopened",
        session_id: issue.session_id,
        show_id: issue.show_id,
        status: "unread",
        technician_name: technicianName,
        title: "Issue Reopened",
      })),
    );

    noticeError = noticeError ?? error;
  }

  return {
    error: null,
    historyError,
    newStatus,
    noticeError,
    technicianName: activeAssignment?.technician_name ?? null,
  };
}
