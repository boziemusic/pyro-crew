"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  getAppFeedbackDiagnostics,
  getAppFeedbackSettings,
  setAppFeedbackSettings,
  subscribeToAppFeedbackDiagnostics,
  subscribeToAppFeedbackSettings,
  testAppFeedbackSound,
  unlockAppFeedback,
} from "@/lib/app-feedback";

const serverSettings = {
  soundsEnabled: false,
  vibrationEnabled: true,
};

function useFeedbackSettings() {
  const settings = useSyncExternalStore(
    subscribeToAppFeedbackSettings,
    getAppFeedbackSettings,
    () => serverSettings,
  );

  useEffect(() => {
    if (!settings.soundsEnabled) {
      return;
    }

    const unlock = () => {
      void unlockAppFeedback();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };

    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [settings.soundsEnabled]);

  return settings;
}

function useFeedbackDiagnostics() {
  return useSyncExternalStore(
    subscribeToAppFeedbackDiagnostics,
    getAppFeedbackDiagnostics,
    getAppFeedbackDiagnostics,
  );
}

function SoundDiagnosticsText({
  className = "",
}: {
  className?: string;
}) {
  const settings = useFeedbackSettings();
  const diagnostics = useFeedbackDiagnostics();

  return (
    <div className={`text-[10px] leading-4 text-[#94a3b8] ${className}`}>
      <p>Sounds enabled: {settings.soundsEnabled ? "yes" : "no"}</p>
      <p>Audio unlocked: {diagnostics.audioUnlocked ? "yes" : "no"}</p>
      <p>Last sound attempted: {diagnostics.lastSoundRequested}</p>
      <p>Last result: {diagnostics.lastSoundResult}</p>
      {diagnostics.lastSoundDetail ? (
        <p className="break-words text-[#cbd5e1]">
          {diagnostics.lastSoundDetail}
        </p>
      ) : null}
    </div>
  );
}

function TestSoundButton({ className = "" }: { className?: string }) {
  return (
    <button
      className={`rounded-md border border-[#8b5cf6]/35 bg-[#17102c] px-3 py-2 text-xs font-semibold text-white transition hover:border-[#c4b5fd] active:bg-[#211044] ${className}`}
      onClick={() => void testAppFeedbackSound()}
      type="button"
    >
      Test Sound
    </button>
  );
}

export function AppFeedbackControls() {
  const settings = useFeedbackSettings();

  const toggleSounds = async () => {
    const soundsEnabled = !settings.soundsEnabled;
    setAppFeedbackSettings({
      ...settings,
      soundsEnabled,
    });

    if (soundsEnabled) {
      await testAppFeedbackSound();
    }
  };

  return (
    <div className="flex items-start gap-2">
      <button
        aria-pressed={settings.soundsEnabled}
        className="rounded-md border border-white/10 bg-[#0d1324] px-3 py-2 text-xs font-semibold text-[#cbd5e1] transition hover:border-[#8b5cf6]/55 hover:text-white"
        onClick={() => void toggleSounds()}
        type="button"
      >
        Sounds: {settings.soundsEnabled ? "On" : "Off"}
      </button>
      <div className="grid gap-1">
        <TestSoundButton />
        <SoundDiagnosticsText className="max-w-64 rounded-md border border-white/10 bg-[#050816]/80 p-2" />
      </div>
    </div>
  );
}

export function MobileTechnicianAlertToggle() {
  const settings = useFeedbackSettings();

  useEffect(() => {
    if (!settings.vibrationEnabled) {
      setAppFeedbackSettings({
        ...settings,
        vibrationEnabled: true,
      });
    }
  }, [settings]);

  const toggleAlerts = async () => {
    const soundsEnabled = !settings.soundsEnabled;
    setAppFeedbackSettings({
      soundsEnabled,
      vibrationEnabled: true,
    });

    if (soundsEnabled) {
      await testAppFeedbackSound();
    }
  };

  const label = settings.soundsEnabled ? "Alerts On" : "Silent Mode";

  return (
    <button
      aria-label={label}
      aria-pressed={settings.soundsEnabled}
      className={`relative flex h-11 w-11 touch-manipulation items-center justify-center rounded-lg border text-white transition active:bg-[#17102c] ${
        settings.soundsEnabled
          ? "border-[#22c55e]/45 bg-[#082515]"
          : "border-white/15 bg-[#0d1324]"
      }`}
      onClick={() => void toggleAlerts()}
      title={label}
      type="button"
    >
      <svg
        aria-hidden="true"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
      >
        <path
          d="M9 18V5l10-2v13M9 9l10-2M6.5 21C4.57 21 3 19.88 3 18.5S4.57 16 6.5 16 10 17.12 10 18.5 8.43 21 6.5 21Zm10-2c-1.93 0-3.5-1.12-3.5-2.5s1.57-2.5 3.5-2.5 3.5 1.12 3.5 2.5-1.57 2.5-3.5 2.5Z"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
      {!settings.soundsEnabled ? (
        <span
          aria-hidden="true"
          className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full border border-[#fecaca] bg-[#7f1d1d] text-[10px] font-black leading-none text-white"
        >
          /
        </span>
      ) : null}
    </button>
  );
}

export function MobileTechnicianSoundDiagnostics() {
  return (
    <div className="mt-2 rounded-md border border-white/10 bg-[#050816]/80 p-2">
      <TestSoundButton className="min-h-10 w-full" />
      <SoundDiagnosticsText className="mt-2" />
    </div>
  );
}
