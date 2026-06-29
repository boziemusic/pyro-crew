import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export type PushNotificationStatus =
  | "enabled"
  | "disabled"
  | "blocked"
  | "not_supported"
  | "not_available";

export type PushRegistrationResult = {
  message?: string;
  status: PushNotificationStatus;
};

const IPHONE_PWA_GUIDANCE =
  "On iPhone, add Pyro Crew Continuity to your Home Screen, then reopen it to enable notifications.";

type DevicePushSubscriptionRow = {
  device_id: string;
  endpoint: string;
  push_subscription: PushSubscriptionJSON;
  browser_name: string | null;
  platform_name: string | null;
  user_agent: string | null;
  app_name: "continuity";
  permission_status: NotificationPermission;
  is_active: boolean;
  last_seen_at: string;
};

function isStandalonePwa() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator &&
      Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

function isIPhoneSafariLike() {
  const userAgent = window.navigator.userAgent;
  return /iPhone|iPad|iPod/i.test(userAgent) && /Safari/i.test(userAgent);
}

function getBrowserName(userAgent: string) {
  if (/Edg\//i.test(userAgent)) return "Edge";
  if (/Chrome\//i.test(userAgent) && !/Chromium/i.test(userAgent)) return "Chrome";
  if (/Firefox\//i.test(userAgent)) return "Firefox";
  if (/Safari\//i.test(userAgent) && /Version\//i.test(userAgent)) return "Safari";
  return "Unknown";
}

function getPlatformName() {
  const nav = window.navigator as Navigator & { userAgentData?: { platform?: string } };
  return nav.userAgentData?.platform ?? window.navigator.platform ?? "Unknown";
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

async function waitForServiceWorkerRegistration() {
  if (navigator.serviceWorker.controller) {
    return navigator.serviceWorker.ready;
  }

  const registration = await navigator.serviceWorker.ready;
  if (registration.active) {
    return registration;
  }

  return registration;
}

export function getPushNotificationStatus(): PushRegistrationResult {
  if (typeof window === "undefined") {
    return { status: "not_available" };
  }

  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    return { status: "not_supported" };
  }

  if (!("PushManager" in window)) {
    if (isIPhoneSafariLike() && !isStandalonePwa()) {
      return { status: "not_available", message: IPHONE_PWA_GUIDANCE };
    }

    return { status: "not_supported" };
  }

  if (Notification.permission === "granted") {
    return { status: "enabled" };
  }

  if (Notification.permission === "denied") {
    return { status: "blocked" };
  }

  return { status: "disabled" };
}

export function formatPushStatus(status: PushNotificationStatus) {
  const labels: Record<PushNotificationStatus, string> = {
    blocked: "Blocked",
    disabled: "Disabled",
    enabled: "Enabled",
    not_available: "Not Available",
    not_supported: "Not Supported",
  };

  return labels[status];
}

export async function registerDevicePushSubscription({
  deviceId,
  supabase = createSupabaseBrowserClient(),
}: {
  deviceId: string;
  supabase?: SupabaseClient;
}): Promise<PushRegistrationResult> {
  const supportStatus = getPushNotificationStatus();

  if (
    supportStatus.status === "not_supported" ||
    supportStatus.status === "not_available" ||
    supportStatus.status === "blocked"
  ) {
    return supportStatus;
  }

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  if (!vapidPublicKey) {
    return {
      status: "not_available",
      message: "Push notifications are not configured for this environment.",
    };
  }

  const permission = await Notification.requestPermission();
  if (permission === "denied") {
    return { status: "blocked" };
  }

  if (permission !== "granted") {
    return { status: "disabled" };
  }

  const registration = await waitForServiceWorkerRegistration();
  const existingSubscription = await registration.pushManager.getSubscription();
  const pushSubscription =
    existingSubscription ??
    (await registration.pushManager.subscribe({
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      userVisibleOnly: true,
    }));
  const subscriptionJson = pushSubscription.toJSON();
  const endpoint = pushSubscription.endpoint;
  const now = new Date().toISOString();
  const userAgent = window.navigator.userAgent;
  const row: DevicePushSubscriptionRow = {
    app_name: "continuity",
    browser_name: getBrowserName(userAgent),
    device_id: deviceId,
    endpoint,
    is_active: true,
    last_seen_at: now,
    permission_status: permission,
    platform_name: getPlatformName(),
    push_subscription: subscriptionJson,
    user_agent: userAgent,
  };

  const result = await supabase
    .from("device_push_subscriptions")
    .upsert(row, { onConflict: "endpoint" });

  if (result.error) {
    return {
      status: "not_available",
      message: `Push subscription could not be saved: ${result.error.message}`,
    };
  }

  return { status: "enabled" };
}