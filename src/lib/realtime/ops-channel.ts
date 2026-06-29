import type { RealtimeChannel } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export type OpsRealtimeTable =
  | "issues"
  | "issue_assignments"
  | "technician_alert_reads"
  | "technician_notices";

export type OpsRealtimeEvent = {
  eventType: "INSERT" | "UPDATE";
  new: Record<string, unknown>;
  old: Record<string, unknown>;
  table: OpsRealtimeTable;
};

type OpsChannelHandlers = {
  onChange?: (event: OpsRealtimeEvent) => void;
  onDisconnect?: (status: string, error?: Error) => void;
  onReady?: () => void;
};

let activeChannel: RealtimeChannel | null = null;
let activeShowId: string | null = null;

const subscribedTables: OpsRealtimeTable[] = [
  "issues",
  "issue_assignments",
  "technician_alert_reads",
  "technician_notices",
];

export function unsubscribeFromOpsChannel() {
  if (!activeChannel) {
    activeShowId = null;
    return;
  }

  const supabase = createSupabaseBrowserClient();
  void supabase.removeChannel(activeChannel);
  activeChannel = null;
  activeShowId = null;
}

export function subscribeToOpsChannel(
  showId: string,
  handlers: OpsChannelHandlers = {},
) {
  const normalizedShowId = showId.trim();

  if (!normalizedShowId) {
    unsubscribeFromOpsChannel();
    return null;
  }

  if (activeChannel && activeShowId === normalizedShowId) {
    return activeChannel;
  }

  unsubscribeFromOpsChannel();

  const supabase = createSupabaseBrowserClient();
  const channel = supabase.channel(`ops:${normalizedShowId}`);

  subscribedTables.forEach((table) => {
    channel.on(
      "postgres_changes",
      {
        event: "*",
        filter: `show_id=eq.${normalizedShowId}`,
        schema: "public",
        table,
      },
      (payload) => {
        if (payload.eventType !== "INSERT" && payload.eventType !== "UPDATE") {
          return;
        }

        handlers.onChange?.({
          eventType: payload.eventType,
          new: (payload.new ?? {}) as Record<string, unknown>,
          old: (payload.old ?? {}) as Record<string, unknown>,
          table,
        });
      },
    );
  });

  channel.subscribe((status, error) => {
    if (status === "SUBSCRIBED") {
      handlers.onReady?.();
      return;
    }

    if (
      status === "CHANNEL_ERROR" ||
      status === "TIMED_OUT" ||
      status === "CLOSED"
    ) {
      console.warn("Ops realtime channel disconnected", status, error);
      handlers.onDisconnect?.(status, error);
    }
  });

  activeChannel = channel;
  activeShowId = normalizedShowId;

  return channel;
}