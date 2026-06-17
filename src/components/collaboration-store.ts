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
export const HEARTBEAT_ENABLED = false;
const TECHNICIAN_HEARTBEAT_DEVICE_STORAGE_KEY =
  "pyro-crew-technician-heartbeat-device-id";

let cachedHeartbeatDeviceId: string | null = null;

function getTimestampValue(value: string | null | undefined) {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function announceCollaborationChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(COLLABORATION_EVENT));
  }
}

function createHeartbeatDeviceId() {
  if (
    typeof window !== "undefined" &&
    window.crypto &&
    "randomUUID" in window.crypto
  ) {
    return window.crypto.randomUUID();
  }

  return `device-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export function getTechnicianHeartbeatDeviceId() {
  if (cachedHeartbeatDeviceId) {
    return cachedHeartbeatDeviceId;
  }

  if (typeof window === "undefined") {
    cachedHeartbeatDeviceId = createHeartbeatDeviceId();
    return cachedHeartbeatDeviceId;
  }

  let stored: string | undefined;

  try {
    stored = window.localStorage
      .getItem(TECHNICIAN_HEARTBEAT_DEVICE_STORAGE_KEY)
      ?.trim();
  } catch {
    stored = undefined;
  }

  if (stored) {
    cachedHeartbeatDeviceId = stored;
    return cachedHeartbeatDeviceId;
  }

  cachedHeartbeatDeviceId = createHeartbeatDeviceId();
  try {
    window.localStorage.setItem(
      TECHNICIAN_HEARTBEAT_DEVICE_STORAGE_KEY,
      cachedHeartbeatDeviceId,
    );
  } catch {
    // Locked-down browsers can reject localStorage; keep a tab-local id.
  }

  return cachedHeartbeatDeviceId;
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
  const { error } = await supabase.from("technician_notices").insert([
    {
      issue_id: payload.issueId,
      message: `The Director moved this issue to ${payload.toTechnician}.`,
      notice_type: "reassigned",
      session_id: sessionId,
      show_id: showId,
      status: "unread",
      technician_name: payload.fromTechnician,
      title: "Issue Reassigned",
    },
    {
      issue_id: payload.issueId,
      message: `This issue was handed off from ${payload.fromTechnician}.`,
      notice_type: "handoff",
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
    .in("notice_type", ["handoff_incoming", "handoff"])
    .eq("status", "unread");

  if (!result.error) {
    announceCollaborationChange();
  }

  return result;
}

export async function recordJoinedTechnician({
  sessionId,
  showId,
  technicianId,
}: {
  sessionId: string | null;
  showId: string;
  technicianId: TemporaryTechnicianId;
}) {
  const supabase = createSupabaseBrowserClient();
  const { data: existing, error: existingError } = await supabase
    .from("technician_notices")
    .select("id")
    .eq("show_id", showId)
    .eq("technician_name", technicianId)
    .eq("notice_type", "technician_joined")
    .limit(1);

  if (existingError) {
    return { error: existingError };
  }

  if (existing && existing.length > 0) {
    const result = await supabase
      .from("technician_notices")
      .update({
        acknowledged_at: new Date().toISOString(),
        session_id: sessionId,
      })
      .eq("id", existing[0].id);

    if (!result.error) {
      announceCollaborationChange();
    }

    return { error: result.error };
  }

  const result = await supabase.from("technician_notices").insert({
    issue_id: null,
    message: null,
    notice_type: "technician_joined",
    session_id: sessionId,
    show_id: showId,
    status: "acknowledged",
    technician_name: technicianId,
    title: "Technician Joined",
    acknowledged_at: new Date().toISOString(),
  });

  if (!result.error) {
    announceCollaborationChange();
  }

  return { error: result.error };
}

export async function removeTechnicianFromSession({
  sessionId,
  showId,
  technicianId,
}: {
  sessionId: string;
  showId: string;
  technicianId: TemporaryTechnicianId;
}) {
  const supabase = createSupabaseBrowserClient();
  const removedAt = new Date().toISOString();
  const deleteResult = await supabase
    .from("technician_notices")
    .delete()
    .eq("show_id", showId)
    .eq("session_id", sessionId)
    .eq("technician_name", technicianId)
    .eq("notice_type", "technician_joined");

  if (deleteResult.error) {
    return { error: deleteResult.error };
  }

  const noticeResult = await createTechnicianNotice({
    issueId: null,
    message: `Removed from session at ${removedAt}.`,
    noticeType: "technician_removed",
    sessionId,
    showId,
    technicianId,
    title: "Removed From Session",
  });

  if (!noticeResult.error) {
    announceCollaborationChange();
  }

  return { error: noticeResult.error };
}

export async function recordTechnicianHeartbeat({
  sessionId,
  showId,
  technicianId,
}: {
  sessionId: string;
  showId: string;
  technicianId: TemporaryTechnicianId;
}) {
  if (!HEARTBEAT_ENABLED) {
    return { error: null };
  }

  const supabase = createSupabaseBrowserClient();
  const now = new Date().toISOString();
  const deviceId = getTechnicianHeartbeatDeviceId();

  const result = await supabase
    .from("technician_heartbeats")
    .upsert(
      {
        device_id: deviceId,
        last_seen_at: now,
        session_id: sessionId,
        show_id: showId,
        technician_name: technicianId,
        updated_at: now,
      },
      {
        onConflict:
          "show_id,session_id,technician_name,device_id",
      },
    );

  if (!result.error) {
    announceCollaborationChange();
  }

  return { error: result.error };
}

export async function fetchShowTechnicianNames({
  showId,
}: {
  sessionId?: string | null;
  showId: string;
}) {
  const supabase = createSupabaseBrowserClient();
  const [
    primaryResult,
    additionalResult,
    noticeResult,
  ] = await Promise.all([
    supabase
      .from("issue_assignments")
      .select("technician_name")
      .eq("show_id", showId),
    supabase
      .from("additional_technician_assignments")
      .select("primary_technician_name, additional_technician_name")
      .eq("show_id", showId),
    supabase
      .from("technician_notices")
      .select("technician_name")
      .eq("show_id", showId),
  ]);

  const error =
    primaryResult.error ?? additionalResult.error ?? noticeResult.error;

  if (error) {
    return { data: [], error };
  }

  const names = new Set<string>();

  (primaryResult.data ?? []).forEach((row) => {
    if (row.technician_name?.trim()) {
      names.add(row.technician_name.trim());
    }
  });
  (additionalResult.data ?? []).forEach((row) => {
    if (row.primary_technician_name?.trim()) {
      names.add(row.primary_technician_name.trim());
    }
    if (row.additional_technician_name?.trim()) {
      names.add(row.additional_technician_name.trim());
    }
  });
  (noticeResult.data ?? []).forEach((row) => {
    if (row.technician_name?.trim()) {
      names.add(row.technician_name.trim());
    }
  });

  return {
    data: [...names].sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: "base" }),
    ),
    error: null,
  };
}

export function useShowTechnicianNames(
  showId: string | undefined,
  sessionId: string | null | undefined,
) {
  const [technicianNames, setTechnicianNames] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!showId) {
      setTechnicianNames([]);
      setError(null);
      return;
    }

    const { data, error: queryError } = await fetchShowTechnicianNames({
      sessionId,
      showId,
    });

    if (queryError) {
      setError(queryError.message);
      return;
    }

    setTechnicianNames(data);
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

  return { error, refresh, technicianNames };
}

export function useJoinedSessionTechnicianNames(
  showId: string | undefined,
  sessionId: string | null | undefined,
) {
  const [technicianNames, setTechnicianNames] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!showId || !sessionId) {
      setTechnicianNames([]);
      setError(null);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const { data, error: queryError } = await supabase
      .from("technician_notices")
      .select("technician_name")
      .eq("show_id", showId)
      .eq("session_id", sessionId)
      .eq("notice_type", "technician_joined");

    if (queryError) {
      setError(queryError.message);
      return;
    }

    const names = new Set<string>();
    (data ?? []).forEach((row) => {
      if (row.technician_name?.trim()) {
        names.add(row.technician_name.trim());
      }
    });

    setTechnicianNames(
      [...names].sort((left, right) =>
        left.localeCompare(right, undefined, { sensitivity: "base" }),
      ),
    );
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

  return { error, refresh, technicianNames };
}

export function useShowTechnicianPresence(
  showId: string | undefined,
  sessionId: string | null | undefined,
) {
  const [presenceByTechnician, setPresenceByTechnician] = useState<
    Record<string, string>
  >({});
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!showId) {
      setPresenceByTechnician({});
      setError(null);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    if (!HEARTBEAT_ENABLED) {
      setPresenceByTechnician({});
      setError(null);
      return;
    }

    let query = supabase
      .from("technician_heartbeats")
      .select("technician_name, last_seen_at")
      .eq("show_id", showId);

    if (sessionId) {
      query = query.eq("session_id", sessionId);
    } else {
      setPresenceByTechnician({});
      setError(null);
      return;
    }

    const { data, error: queryError } = await query;

    if (queryError) {
      setError(queryError.message);
      return;
    }

    const nextPresence: Record<string, string> = {};

    (data ?? []).forEach((row) => {
      const technicianName = row.technician_name?.trim();
      const activeAt = row.last_seen_at;

      if (!technicianName || !activeAt) {
        return;
      }

      if (
        !nextPresence[technicianName] ||
        getTimestampValue(activeAt) >
          getTimestampValue(nextPresence[technicianName])
      ) {
        nextPresence[technicianName] = activeAt;
      }
    });

    setPresenceByTechnician(nextPresence);
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

  return { error, presenceByTechnician, refresh };
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
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!showId) {
      setNotices([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

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

    try {
      const { data, error: queryError } = await query.order("created_at", {
        ascending: false,
      });

      if (queryError) {
        setError(queryError.message);
        return;
      }

      setNotices((data ?? []) as TechnicianNotice[]);
      setError(null);
    } catch (queryError) {
      setError(
        queryError instanceof Error
          ? queryError.message
          : "Unknown technician notice fetch failure.",
      );
    } finally {
      setIsLoading(false);
    }
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

  return { error, isLoading, notices, refresh };
}
