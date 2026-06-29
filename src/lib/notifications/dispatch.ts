import { createSupabaseBrowserClient } from "@/lib/supabase";

export type PushDispatchPayload = {
  title: string;
  body: string;
  data?: {
    type: "issue" | "dm" | "voice" | "system";
    show_id?: string;
    session_id?: string | null;
    issue_id?: string;
    [key: string]: unknown;
  };
};

export async function notifyDevice(
  deviceId: string | null | undefined,
  payload: PushDispatchPayload,
) {
  const normalizedDeviceId = deviceId?.trim();
  if (!normalizedDeviceId) {
    return { ok: false, skipped: true, error: "Missing device_id" };
  }

  try {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.functions.invoke("send-push", {
      body: {
        body: payload.body,
        data: payload.data,
        device_id: normalizedDeviceId,
        title: payload.title,
      },
    });

    if (error) {
      console.warn("Push notification dispatch failed", error);
      return { ok: false, skipped: false, error: error.message };
    }

    return { ok: true, data, skipped: false };
  } catch (error) {
    console.warn("Push notification dispatch failed", error);
    return {
      ok: false,
      skipped: false,
      error:
        error instanceof Error
          ? error.message
          : "Unknown push notification dispatch failure",
    };
  }
}