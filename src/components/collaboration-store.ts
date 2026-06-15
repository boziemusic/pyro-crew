"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import type { TemporaryTechnicianId } from "./temporary-technician-store";

export type AdditionalTechnicianAssignment = {
  id: string;
  issue_id: string;
  show_id: string;
  session_id: string | null;
  primary_technician_name: string;
  additional_technician_name: string;
  status: string;
  requested_note: string | null;
  director_note: string | null;
  assigned_at: string;
  completed_at: string | null;
};

export type TechnicianNotice = {
  id: string;
  issue_id: string | null;
  show_id: string;
  session_id: string | null;
  technician_name: string;
  notice_type: string;
  title: string;
  message: string | null;
  status: string;
  created_at: string;
  acknowledged_at: string | null;
};

export type HandoffNoticePayload = {
  issueId: string;
  fromTechnician: TemporaryTechnicianId;
  toTechnician: TemporaryTechnicianId;
  previousStatus: string;
  channelNumber: number;
  cueValue: string;
  issueType: string;
  positionName: string | null;
  effectName: string | null;
  handoffNote?: string | null;
};

const COLLABORATION_EVENT = "pyro-crew-collaboration-change";

function announceCollaborationChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(COLLABORATION_EVENT));
  }
}

export async function fetchActiveAdditionalTechnicianAssignments({
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
    .from("additional_technician_assignments")
    .select(
      "id, issue_id, show_id, session_id, primary_technician_name, additional_technician_name, status, requested_note, director_note, assigned_at, completed_at",
    )
    .eq("show_id", showId)
    .eq("status", "active");

  if (sessionId) {
    query = query.eq("session_id", sessionId);
  } else if (sessionId === null) {
    query = query.is("session_id", null);
  }

  if (technicianId) {
    query = query.eq("additional_technician_name", technicianId);
  }

  return query.order("assigned_at", { ascending: true });
}

export async function createAdditionalTechnicianAssignment({
  additionalTechnicianId,
  directorNote,
  issueId,
  primaryTechnicianId,
  requestedNote,
  sessionId,
  showId,
}: {
  additionalTechnicianId: TemporaryTechnicianId;
  directorNote: string | null;
  issueId: string;
  primaryTechnicianId: TemporaryTechnicianId;
  requestedNote: string | null;
  sessionId: string | null;
  showId: string;
}) {
  const supabase = createSupabaseBrowserClient();
  const { data: existing, error: existingError } = await supabase
    .from("additional_technician_assignments")
    .select(
      "id, issue_id, show_id, session_id, primary_technician_name, additional_technician_name, status, requested_note, director_note, assigned_at, completed_at",
    )
    .eq("issue_id", issueId)
    .eq("additional_technician_name", additionalTechnicianId)
    .eq("status", "active")
    .maybeSingle();

  if (existingError) {
    return { data: null, error: existingError };
  }

  if (existing) {
    return {
      data: existing as AdditionalTechnicianAssignment,
      error: null,
    };
  }

  const result = await supabase
    .from("additional_technician_assignments")
    .insert({
      additional_technician_name: additionalTechnicianId,
      director_note: directorNote,
      issue_id: issueId,
      primary_technician_name: primaryTechnicianId,
      requested_note: requestedNote,
      session_id: sessionId,
      show_id: showId,
      status: "active",
    })
    .select(
      "id, issue_id, show_id, session_id, primary_technician_name, additional_technician_name, status, requested_note, director_note, assigned_at, completed_at",
    )
    .single();

  if (!result.error) {
    announceCollaborationChange();
  }

  return {
    data: result.data
      ? (result.data as AdditionalTechnicianAssignment)
      : null,
    error: result.error,
  };
}

export async function completeAdditionalTechnicianAssignments(
  issueId: string,
) {
  const supabase = createSupabaseBrowserClient();
  const result = await supabase
    .from("additional_technician_assignments")
    .update({
      completed_at: new Date().toISOString(),
      status: "completed",
      updated_at: new Date().toISOString(),
    })
    .eq("issue_id", issueId)
    .eq("status", "active");

  if (!result.error) {
    announceCollaborationChange();
  }

  return result;
}

export async function createTechnicianNotice({
  issueId,
  message,
  noticeType,
  sessionId,
  showId,
  technicianId,
  title,
}: {
  issueId: string | null;
  message: string | null;
  noticeType: string;
  sessionId: string | null;
  showId: string;
  technicianId: TemporaryTechnicianId;
  title: string;
}) {
  const supabase = createSupabaseBrowserClient();
  const result = await supabase
    .from("technician_notices")
    .insert({
      issue_id: issueId,
      message,
      notice_type: noticeType,
      session_id: sessionId,
      show_id: showId,
      status: "unread",
      technician_name: technicianId,
      title,
    })
    .select(
      "id, issue_id, show_id, session_id, technician_name, notice_type, title, message, status, created_at, acknowledged_at",
    )
    .single();

  if (!result.error) {
    announceCollaborationChange();
  }

  return {
    data: result.data ? (result.data as TechnicianNotice) : null,
    error: result.error,
  };
}

export async function createHandoffNotices({
  payload,
  sessionId,
  showId,
}: {
  payload: HandoffNoticePayload;
  sessionId: string | null;
  showId: string;
}) {
  const supabase = createSupabaseBrowserClient();
  const message = JSON.stringify(payload);
  const { error } = await supabase.from("technician_notices").insert([
    {
      issue_id: payload.issueId,
      message,
      notice_type: "handoff_outgoing",
      session_id: sessionId,
      show_id: showId,
      status: "unread",
      technician_name: payload.fromTechnician,
      title: "Issue Reassigned",
    },
    {
      issue_id: payload.issueId,
      message,
      notice_type: "handoff_incoming",
      session_id: sessionId,
      show_id: showId,
      status: "unread",
      technician_name: payload.toTechnician,
      title: "Issue Handoff",
    },
  ]);

  if (!error) {
    announceCollaborationChange();
  }

  return { error };
}

export async function acknowledgeTechnicianNotice(
  noticeId: string,
  message?: string | null,
) {
  const supabase = createSupabaseBrowserClient();
  const updates: {
    acknowledged_at: string;
    message?: string | null;
    status: string;
  } = {
    acknowledged_at: new Date().toISOString(),
    status: "acknowledged",
  };

  if (message !== undefined) {
    updates.message = message;
  }

  const result = await supabase
    .from("technician_notices")
    .update(updates)
    .eq("id", noticeId);

  if (!result.error) {
    announceCollaborationChange();
  }

  return result;
}

export async function updateIncomingHandoffNotice({
  issueId,
  message,
  technicianId,
}: {
  issueId: string;
  message: string;
  technicianId: TemporaryTechnicianId;
}) {
  const supabase = createSupabaseBrowserClient();
  const result = await supabase
    .from("technician_notices")
    .update({ message })
    .eq("issue_id", issueId)
    .eq("technician_name", technicianId)
    .eq("notice_type", "handoff_incoming")
    .eq("status", "unread");

  if (!result.error) {
    announceCollaborationChange();
  }

  return result;
}

export function parseHandoffNoticePayload(
  message: string | null,
): HandoffNoticePayload | null {
  if (!message) {
    return null;
  }

  try {
    return JSON.parse(message) as HandoffNoticePayload;
  } catch {
    return null;
  }
}

export function useActiveAdditionalTechnicianAssignments(
  showId: string | undefined,
  sessionId: string | null | undefined,
) {
  const [assignments, setAssignments] = useState<
    AdditionalTechnicianAssignment[]
  >([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!showId) {
      setAssignments([]);
      setError(null);
      return;
    }

    const { data, error: queryError } =
      await fetchActiveAdditionalTechnicianAssignments({
        sessionId,
        showId,
      });

    if (queryError) {
      setError(queryError.message);
      return;
    }

    setAssignments((data ?? []) as AdditionalTechnicianAssignment[]);
    setError(null);
  }, [sessionId, showId]);

  useEffect(() => {
    const handleChange = () => void refresh();
    const initialId = window.setTimeout(handleChange, 0);
    const intervalId = window.setInterval(handleChange, 5000);
    window.addEventListener(COLLABORATION_EVENT, handleChange);

    return () => {
      window.clearTimeout(initialId);
      window.clearInterval(intervalId);
      window.removeEventListener(COLLABORATION_EVENT, handleChange);
    };
  }, [refresh]);

  const assignmentsByIssue = useMemo(
    () =>
      Object.fromEntries(
        assignments.map((assignment) => [
          assignment.issue_id,
          assignment.additional_technician_name as TemporaryTechnicianId,
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
    refresh,
  };
}

export function useTechnicianNotices(
  showId: string | undefined,
  sessionId: string | null | undefined,
  technicianId: TemporaryTechnicianId,
) {
  const [notices, setNotices] = useState<TechnicianNotice[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!showId) {
      setNotices([]);
      setError(null);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    let query = supabase
      .from("technician_notices")
      .select(
        "id, issue_id, show_id, session_id, technician_name, notice_type, title, message, status, created_at, acknowledged_at",
      )
      .eq("show_id", showId)
      .eq("technician_name", technicianId)
      .eq("status", "unread");

    if (sessionId) {
      query = query.eq("session_id", sessionId);
    } else if (sessionId === null) {
      query = query.is("session_id", null);
    }

    const { data, error: queryError } = await query.order("created_at", {
      ascending: false,
    });

    if (queryError) {
      setError(queryError.message);
      return;
    }

    setNotices((data ?? []) as TechnicianNotice[]);
    setError(null);
  }, [sessionId, showId, technicianId]);

  useEffect(() => {
    const handleChange = () => void refresh();
    const initialId = window.setTimeout(handleChange, 0);
    const intervalId = window.setInterval(handleChange, 5000);
    window.addEventListener(COLLABORATION_EVENT, handleChange);

    return () => {
      window.clearTimeout(initialId);
      window.clearInterval(intervalId);
      window.removeEventListener(COLLABORATION_EVENT, handleChange);
    };
  }, [refresh]);

  return { error, notices, refresh };
}
