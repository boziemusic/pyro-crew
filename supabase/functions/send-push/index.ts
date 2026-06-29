import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import webpush from "npm:web-push";

type PushPayload = {
  device_id?: string;
  title?: string;
  body?: string;
  data?: {
    type?: "issue" | "dm" | "voice" | "system";
    show_id?: string;
    session_id?: string;
    issue_id?: string;
    [key: string]: unknown;
  };
};

type DevicePushSubscription = {
  id: string;
  endpoint: string;
  push_subscription: webpush.PushSubscription;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
    status,
  });
}

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let payload: PushPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const deviceId = payload.device_id?.trim();
  const title = payload.title?.trim();
  const body = payload.body?.trim();

  if (!deviceId || !title || !body) {
    return jsonResponse(
      { error: "device_id, title, and body are required" },
      400,
    );
  }

  const supabaseUrl = getRequiredEnv("SUPABASE_URL");
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const vapidPublicKey =
    Deno.env.get("VAPID_PUBLIC_KEY")?.trim() ??
    Deno.env.get("NEXT_PUBLIC_VAPID_PUBLIC_KEY")?.trim();
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")?.trim();

  if (!vapidPublicKey || !vapidPrivateKey) {
    return jsonResponse({ error: "VAPID keys are not configured" }, 500);
  }

  webpush.setVapidDetails(
    "mailto:notifications@pyro-crew.com",
    vapidPublicKey,
    vapidPrivateKey,
  );

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: subscriptions, error } = await supabase
    .from("device_push_subscriptions")
    .select("id, endpoint, push_subscription")
    .eq("device_id", deviceId)
    .eq("app_name", "continuity")
    .eq("is_active", true);

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  if (!subscriptions || subscriptions.length === 0) {
    return jsonResponse({ ok: true, sent: 0, inactive: 0 });
  }

  const notificationPayload = JSON.stringify({
    notification: {
      badge: "/icons/pwa-192.png",
      body,
      data: payload.data ?? { type: "system" },
      icon: "/icons/pwa-192.png",
      requireInteraction: true,
      title,
      vibrate: [200, 100, 200, 100, 200],
    },
  });
  let sent = 0;
  let inactive = 0;
  const failures: string[] = [];

  await Promise.all(
    (subscriptions as DevicePushSubscription[]).map(async (subscription) => {
      try {
        await webpush.sendNotification(
          subscription.push_subscription,
          notificationPayload,
          { urgency: "high" },
        );
        sent += 1;
      } catch (sendError) {
        const statusCode =
          typeof sendError === "object" &&
          sendError !== null &&
          "statusCode" in sendError
            ? Number((sendError as { statusCode?: number }).statusCode)
            : 0;

        if (statusCode === 404 || statusCode === 410) {
          inactive += 1;
          await supabase
            .from("device_push_subscriptions")
            .update({
              is_active: false,
              permission_status: "expired",
              updated_at: new Date().toISOString(),
            })
            .eq("id", subscription.id);
          return;
        }

        failures.push(
          sendError instanceof Error
            ? sendError.message
            : "Unknown web-push send failure",
        );
      }
    }),
  );

  return jsonResponse({ ok: true, sent, inactive, failures });
});