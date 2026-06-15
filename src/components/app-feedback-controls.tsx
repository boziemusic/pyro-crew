"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  getAppFeedbackSettings,
  setAppFeedbackSettings,
  subscribeToAppFeedbackSettings,
  testAppFeedbackSound,
  unlockAppFeedback,
} from "@/lib/app-feedback";

const serverSettings = {
  soundsEnabled: false,
  vibrationEnabled: true,
};

export function AppFeedbackControls({
  mobile = false,
}: {
  mobile?: boolean;
}) {
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

  const toggleSounds = async () => {
    const soundsEnabled = !settings.soundsEnabled;
    setAppFeedbackSettings({ ...settings, soundsEnabled });

    if (soundsEnabled) {
      await testAppFeedbackSound();
    }
  };

  const toggleVibration = () => {
    setAppFeedbackSettings({
      ...settings,
      vibrationEnabled: !settings.vibrationEnabled,
    });
  };

  return (
    <div
      className={
        mobile
          ? "grid gap-2 border-t border-white/10 pt-2"
          : "flex items-center"
      }
    >
      <button
        aria-pressed={settings.soundsEnabled}
        className={`${mobile ? "min-h-11 w-full text-left" : ""} rounded-md border border-white/10 bg-[#0d1324] px-3 py-2 text-xs font-semibold text-[#cbd5e1] transition hover:border-[#8b5cf6]/55 hover:text-white`}
        onClick={() => void toggleSounds()}
        type="button"
      >
        Sounds: {settings.soundsEnabled ? "On" : "Off"}
      </button>
      {mobile ? (
        <button
          aria-pressed={settings.vibrationEnabled}
          className="min-h-11 w-full rounded-md border border-white/10 bg-[#0d1324] px-3 py-2 text-left text-xs font-semibold text-[#cbd5e1]"
          onClick={toggleVibration}
          type="button"
        >
          Vibration: {settings.vibrationEnabled ? "On" : "Off"}
        </button>
      ) : null}
    </div>
  );
}
