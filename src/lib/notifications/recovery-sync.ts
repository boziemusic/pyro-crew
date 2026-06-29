import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase";

const RECOVERY_WINDOW_HOURS = 24;
const ACTIVE_ISSUE_STATUSES = [
  "new",
  "assigned",
  "in_progress",
  "retrieving_parts",
  "director_assistance_requested",
  "additional_technician_requested",
  "awaiting_verification",
  "verification_failed",
  "root_cause_required",
  "unfixable_recommended",
];

type DeviceTechnicianContext = {
  id: string;
  show_id: string;
  session_id: string;
  technician_name: string;
};

export type AlertReadContext = {
  sessionId: string;
  showId: string;
  technicianName: string;
};

export type MissedAssignmentNotification = {
  alertKey: string;
  assignedAt: string;
  id: string;
  issue: {
    channel_number: number;
    cue_value: string | null;
    id: string;
    issue_type: string;
    status: string;
  } | null;
  kind: "assignment";
};

export type MissedTechnicianNoticeNotification = {
  alertKey: string;
  createdAt: string;
  id: string;
  issueId: string | null;
  kind: "notice";
  message: string | null;
  noticeType: string;
  title: string;
};

export type MissedNotification =
  | MissedAssignmentNotification
  | MissedTechnicianNoticeNotification;

export type MissedNotificationsResult = {
  context: AlertReadContext | null;
  items: MissedNotification[];
};

function getSinceTimestamp() {
  return new Date(
    Date.now() - RECOVERY_WINDOW_HOURS * 60 * 60 * 1000,
  ).toISOString();
}

function getTimestampValue(value: string | null | undefined) {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getAlertKey(item: { id: string; kind: "assignment" | "notice" }) {
  return `${item.kind}:${item.id}`;
}

async function fetchDeviceContext(
  supabase: SupabaseClient,
  deviceId: string,
) {
  const { data, error } = await supabase
    .from("technician_heartbeats")
    .select("id, show_id, session_id, technician_name")
    .eq("device_id", deviceId)
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      console.warn("Notification recovery context lookup failed", error);
    }
    return null;
  }

  return data as DeviceTechnicianContext;
}

async function markDeviceAppOpened({
  context,
  deviceId,
  supabase,
}: {
  context: DeviceTechnicianContext | null;
  deviceId: string;
  supabase: SupabaseClient;
}) {
  const now = new Date().toISOString();

  const updates = [
    supabase
      .from("device_push_subscriptions")
      .update({
        last_seen_at: now,
      })
      .eq("device_id", deviceId)
      .eq("app_name", "continuity"),
  ];

  if (context) {
    updates.push(
      supabase
        .from("technician_heartbeats")
        .update({
          last_seen_at: now,
          updated_at: now,
        })
        .eq("id", context.id),
    );
  }

  const results = await Promise.all(updates);
  const error = results.find((result) => result.error)?.error;

  if (error) {
    console.warn("Notification recovery last-open tracking failed", error);
  }
}

async function filterUnseenAlerts({
  context,
  deviceId,
  items,
  supabase,
}: {
  context: DeviceTechnicianContext;
  deviceId: string;
  items: MissedNotification[];
  supabase: SupabaseClient;
}) {
  if (items.length === 0) {
    return [];
  }

  const alertKeys = items.map((item) => item.alertKey);
  const { data, error } = await supabase
    .from("technician_alert_reads")
    .select("alert_key")
    .eq("show_id", context.show_id)
    .eq("session_id", context.session_id)
    .eq("technician_name", context.technician_name)
    .eq("device_id", deviceId)
    .in("alert_key", alertKeys);

  if (error) {
    console.warn("Notification recovery read-state lookup failed", error);
    return items;
  }

  const seenKeys = new Set((data ?? []).map((row) => row.alert_key));
  return items.filter((item) => !seenKeys.has(item.alertKey));
}

export async function fetchMissedNotifications(deviceId: string) {
  const supabase = createSupabaseBrowserClient();
  const normalizedDeviceId = deviceId.trim();

  if (!normalizedDeviceId) {
    return { context: null, items: [] } satisfies MissedNotificationsResult;
  }

  const context = await fetchDeviceContext(supabase, normalizedDeviceId);
  await markDeviceAppOpened({ context, deviceId: normalizedDeviceId, supabase });

  if (!context) {
    return { context: null, items: [] } satisfies MissedNotificationsResult;
  }

  const since = getSinceTimestamp();
  const [assignmentResult, noticeResult] = await Promise.all([
    supabase
      .from("issue_assignments")
      .select(
        "id, issue_id, assigned_at, acknowledged_at, issues!inner(id, channel_number, cue_value, issue_type, status)",
      )
      .eq("show_id", context.show_id)
      .eq("session_id", context.session_id)
      .eq("technician_name", context.technician_name)
      .eq("status", "active")
      .is("acknowledged_at", null)
      .in("issues.status", ACTIVE_ISSUE_STATUSES)
      .order("assigned_at", { ascending: false }),
    supabase
      .from("technician_notices")
      .select("id, issue_id, notice_type, title, message, created_at")
      .eq("show_id", context.show_id)
      .eq("session_id", context.session_id)
      .eq("technician_name", context.technician_name)
      .eq("status", "unread")
      .gte("created_at", since)
      .order("created_at", { ascending: false }),
  ]);

  if (assignmentResult.error) {
    console.warn(
      "Notification recovery assignment lookup failed",
      assignmentResult.error,
    );
  }

  if (noticeResult.error) {
    console.warn("Notification recovery notice lookup failed", noticeResult.error);
  }

  const assignmentItems = (assignmentResult.data ?? []).map((assignment) => {
    const item = {
      assignedAt: assignment.assigned_at,
      id: assignment.id,
      issue: Array.isArray(assignment.issues)
        ? (assignment.issues[0] ?? null)
        : (assignment.issues ?? null),
      kind: "assignment" as const,
    };

    return {
      ...item,
      alertKey: getAlertKey(item),
    };
  });
  const noticeItems = (noticeResult.data ?? []).map((notice) => {
    const item = {
      createdAt: notice.created_at,
      id: notice.id,
      issueId: notice.issue_id,
      kind: "notice" as const,
      message: notice.message,
      noticeType: notice.notice_type,
      title: notice.title,
    };

    return {
      ...item,
      alertKey: getAlertKey(item),
    };
  });
  const items = [...assignmentItems, ...noticeItems].sort((left, right) => {
    const leftTime =
      left.kind === "assignment" ? left.assignedAt : left.createdAt;
    const rightTime =
      right.kind === "assignment" ? right.assignedAt : right.createdAt;

    return getTimestampValue(rightTime) - getTimestampValue(leftTime);
  });

  return {
    context: {
      sessionId: context.session_id,
      showId: context.show_id,
      technicianName: context.technician_name,
    },
    items: await filterUnseenAlerts({
      context,
      deviceId: normalizedDeviceId,
      items,
      supabase,
    }),
  } satisfies MissedNotificationsResult;
}

export async function markMissedNotificationsSeen({
  context,
  deviceId,
  items,
}: {
  context: AlertReadContext;
  deviceId: string;
  items: MissedNotification[];
}) {
  if (items.length === 0) {
    return { error: null };
  }

  const supabase = createSupabaseBrowserClient();
  const now = new Date().toISOString();
  const rows = items.map((item) => ({
    alert_key: item.alertKey,
    alert_type: item.kind,
    device_id: deviceId,
    last_seen_at: now,
    session_id: context.sessionId,
    show_id: context.showId,
    source_id: item.id,
    technician_name: context.technicianName,
    updated_at: now,
  }));

  const { error } = await supabase
    .from("technician_alert_reads")
    .upsert(rows, { onConflict: "device_id,alert_key" });

  if (error) {
    console.warn("Notification recovery seen-state write failed", error);
  }

  return { error };
}