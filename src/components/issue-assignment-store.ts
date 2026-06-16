"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import type { TemporaryTechnicianId } from "./temporary-technician-store";

export type IssueAssignment = {
  id: string;
  issue_id: string;
  show_id: string;
  session_id: string | null;
  technician_name: string;
  status: string;
  assigned_at: string;
  acknowledged_at: string | null;
};

export async function fetchActiveIssueAssignments({
  sessionId,
  showId,
  technicianId,
}: {
  sessionId?: string | null;
  showId: string;
  technicianId?: TemporaryTechnicianId;
}) {
  const supabase = createSupabaseBrowserClient();
  let query = supabase
    .from("issue_assignments")
    .select(
      "id, issue_id, show_id, session_id, technician_name, status, assigned_at, acknowledged_at",
    )
    .eq("show_id", showId)
    .eq("status", "active");

  if (sessionId) {
    query = query.eq("session_id", sessionId);
  } else {
    query = query.is("session_id", null);
  }

  if (technicianId) {
    query = query.eq("technician_name", technicianId);
  }

  return query.order("assigned_at", { ascending: true });
}

export async function assignIssueToTechnician({
  issueId,
  sessionId,
  showId,
  technicianId,
}: {
  issueId: string;
  sessionId: string | null;
  showId: string;
  technicianId: TemporaryTechnicianId;
}) {
  const supabase = createSupabaseBrowserClient();
  const { data: currentAssignments, error: currentError } = await supabase
    .from("issue_assignments")
    .select(
      "id, issue_id, show_id, session_id, technician_name, status, assigned_at, acknowledged_at",
    )
    .eq("issue_id", issueId)
    .eq("status", "active");

  if (currentError) {
    return { data: null, error: currentError };
  }

  if (
    currentAssignments?.length === 1 &&
    currentAssignments[0].technician_name === technicianId
  ) {
    return {
      data: currentAssignments[0] as IssueAssignment,
      error: null,
    };
  }

  if (currentAssignments && currentAssignments.length > 0) {
    const { error: reassignError } = await supabase
      .from("issue_assignments")
      .update({
        status: "reassigned",
        updated_at: new Date().toISOString(),
      })
      .eq("issue_id", issueId)
      .eq("status", "active");

    if (reassignError) {
      return { data: null, error: reassignError };
    }
  }

  const { data, error } = await supabase
    .from("issue_assignments")
    .insert({
      issue_id: issueId,
      session_id: sessionId,
      show_id: showId,
      status: "active",
      technician_name: technicianId,
    })
    .select(
      "id, issue_id, show_id, session_id, technician_name, status, assigned_at, acknowledged_at",
    )
    .single();

  if (error && currentAssignments && currentAssignments.length > 0) {
    await supabase
      .from("issue_assignments")
      .update({
        status: "active",
        updated_at: new Date().toISOString(),
      })
      .in(
        "id",
        currentAssignments.map((assignment) => assignment.id),
      )
      .eq("status", "reassigned");
  }

  return {
    data: data ? (data as IssueAssignment) : null,
    error,
  };
}

export async function clearActiveIssueAssignment(issueId: string) {
  const supabase = createSupabaseBrowserClient();

  return supabase
    .from("issue_assignments")
    .update({
      status: "completed",
      updated_at: new Date().toISOString(),
    })
    .eq("issue_id", issueId)
    .eq("status", "active");
}

export async function setActiveIssueAssignmentAcknowledgedAt(
  issueId: string,
  acknowledgedAt: string | null,
) {
  const supabase = createSupabaseBrowserClient();

  return supabase
    .from("issue_assignments")
    .update({
      acknowledged_at: acknowledgedAt,
      updated_at: new Date().toISOString(),
    })
    .eq("issue_id", issueId)
    .eq("status", "active");
}

export function useActiveIssueAssignments(
  showId: string | undefined,
  sessionId: string | null | undefined,
) {
  const [assignments, setAssignments] = useState<IssueAssignment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!showId) {
      setAssignments([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const { data, error: queryError } =
        await fetchActiveIssueAssignments({
          sessionId,
          showId,
        });

      if (queryError) {
        setError(queryError.message);
        return;
      }

      setAssignments((data ?? []) as IssueAssignment[]);
      setError(null);
    } catch (queryError) {
      setError(
        queryError instanceof Error
          ? queryError.message
          : "Unknown assignment fetch failure.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, showId]);

  useEffect(() => {
    const initialLoadId = window.setTimeout(() => {
      void refresh();
    }, 0);
    const intervalId = window.setInterval(() => {
      void refresh();
    }, 5000);

    return () => {
      window.clearTimeout(initialLoadId);
      window.clearInterval(intervalId);
    };
  }, [refresh]);

  const assignmentsByIssue = useMemo(
    () =>
      Object.fromEntries(
        assignments.map((assignment) => [
            assignment.issue_id,
            assignment.technician_name as TemporaryTechnicianId,
          ]),
      ) as Record<string, TemporaryTechnicianId>,
    [assignments],
  );

  const assignmentTimesByIssue = useMemo(
    () =>
      Object.fromEntries(
        assignments.map((assignment) => [
          assignment.issue_id,
          assignment.assigned_at,
        ]),
      ) as Record<string, string>,
    [assignments],
  );

  return {
    assignmentTimesByIssue,
    assignments,
    assignmentsByIssue,
    error,
    isLoading,
    refresh,
  };
}
