"use client";

export type AppFeedbackSettings = {
  soundsEnabled: boolean;
  vibrationEnabled: boolean;
};

export type AppFeedbackDiagnostics = {
  audioUnlocked: boolean;
  lastSoundRequested: string;
  lastSoundResult: "idle" | "played" | "blocked" | "missing" | "error";
  lastSoundDetail: string;
};

const SETTINGS_STORAGE_KEY = "pyro-crew-app-feedback-settings";
const SETTINGS_EVENT = "pyro-crew-app-feedback-settings-change";
const DIAGNOSTICS_EVENT = "pyro-crew-app-feedback-diagnostics-change";
const DEFAULT_SETTINGS: AppFeedbackSettings = {
  soundsEnabled: false,
  vibrationEnabled: true,
};
const DEFAULT_DIAGNOSTICS: AppFeedbackDiagnostics = {
  audioUnlocked: false,
  lastSoundRequested: "None",
  lastSoundResult: "idle",
  lastSoundDetail: "No sound has been requested.",
};

const soundPaths = {
  directorAssistanceNeeded: "/sounds/director-assistance-needed.mp3",
  success: "/sounds/success.mp3",
  uiClick: "/sounds/ui-click.mp3",
  warning: "/sounds/warning.mp3",
} as const;

const soundPools = {
  additionalTechRequested: [
    "/sounds/additional-tech-requested-1.mp3",
    "/sounds/additional-tech-requested-2.mp3",
    "/sounds/additional-tech-requested-3.mp3",
  ],
  verificationRequested: [
    "/sounds/verification-requested-1.mp3",
    "/sounds/verification-requested-2.mp3",
    "/sounds/verification-requested-3.mp3",
    "/sounds/verification-requested-4.mp3",
  ],
} as const;

let audioContext: AudioContext | null = null;
let cachedStorageValue: string | null = null;
let cachedSettings = DEFAULT_SETTINGS;
let diagnostics = DEFAULT_DIAGNOSTICS;
const decodedAudioBuffers = new Map<string, AudioBuffer>();
const previousPoolSelections = new Map<string, string>();

function isBrowser() {
  return typeof window !== "undefined";
}

function updateDiagnostics(
  nextDiagnostics: Partial<AppFeedbackDiagnostics>,
) {
  diagnostics = { ...diagnostics, ...nextDiagnostics };
  if (isBrowser()) {
    window.dispatchEvent(new Event(DIAGNOSTICS_EVENT));
  }
}

export function getAppFeedbackDiagnostics() {
  return diagnostics;
}

export function subscribeToAppFeedbackDiagnostics(
  onStoreChange: () => void,
) {
  if (!isBrowser()) {
    return () => undefined;
  }

  window.addEventListener(DIAGNOSTICS_EVENT, onStoreChange);
  return () =>
    window.removeEventListener(DIAGNOSTICS_EVENT, onStoreChange);
}

export function getAppFeedbackSettings(): AppFeedbackSettings {
  if (!isBrowser()) {
    return DEFAULT_SETTINGS;
  }

  const stored = window.localStorage.getItem(SETTINGS_STORAGE_KEY);

  if (!stored) {
    cachedStorageValue = null;
    cachedSettings = DEFAULT_SETTINGS;
    return cachedSettings;
  }

  if (stored === cachedStorageValue) {
    return cachedSettings;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<AppFeedbackSettings>;
    cachedSettings = {
      soundsEnabled:
        typeof parsed.soundsEnabled === "boolean"
          ? parsed.soundsEnabled
          : DEFAULT_SETTINGS.soundsEnabled,
      vibrationEnabled:
        typeof parsed.vibrationEnabled === "boolean"
          ? parsed.vibrationEnabled
          : DEFAULT_SETTINGS.vibrationEnabled,
    };
    cachedStorageValue = stored;
    return cachedSettings;
  } catch {
    cachedStorageValue = null;
    cachedSettings = DEFAULT_SETTINGS;
    return cachedSettings;
  }
}

export function setAppFeedbackSettings(
  settings: AppFeedbackSettings,
) {
  if (!isBrowser()) {
    return;
  }

  const serializedSettings = JSON.stringify(settings);
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, serializedSettings);
  cachedStorageValue = serializedSettings;
  cachedSettings = settings;
  window.dispatchEvent(new Event(SETTINGS_EVENT));
}

export function subscribeToAppFeedbackSettings(
  onStoreChange: () => void,
) {
  if (!isBrowser()) {
    return () => undefined;
  }

  window.addEventListener("storage", onStoreChange);
  window.addEventListener(SETTINGS_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(SETTINGS_EVENT, onStoreChange);
  };
}

function getAudioContext() {
  if (!isBrowser()) {
    return null;
  }

  audioContext ??= new AudioContext();
  return audioContext;
}

export async function unlockAppFeedback() {
  try {
    const context = getAudioContext();

    if (!context) {
      updateDiagnostics({
        audioUnlocked: false,
        lastSoundResult: "error",
        lastSoundDetail: "WebAudio is unavailable.",
      });
      return false;
    }

    if (context.state === "suspended") {
      await context.resume();
    }

    const audioUnlocked = context.state === "running";
    if (audioUnlocked) {
      updateDiagnostics({
        audioUnlocked: true,
        lastSoundDetail: "WebAudio is unlocked.",
      });
    } else {
      updateDiagnostics({
        audioUnlocked: false,
        lastSoundResult: "blocked",
        lastSoundDetail: "The browser blocked audio playback.",
      });
    }
    return audioUnlocked;
  } catch (error) {
    updateDiagnostics({
      audioUnlocked: false,
      lastSoundResult: "error",
      lastSoundDetail:
        error instanceof Error ? error.message : "Audio unlock failed.",
    });
    return false;
  }
}

async function playGeneratedTone(
  frequency: number,
  durationMs: number,
  volume = 0.045,
) {
  const context = getAudioContext();

  if (!context || context.state !== "running") {
    return false;
  }

  try {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      now + durationMs / 1000,
    );
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + durationMs / 1000);
    return true;
  } catch {
    return false;
  }
}

async function playFallbackTone(
  frequency: number,
  durationMs: number,
) {
  if (!(await unlockAppFeedback())) {
    return false;
  }
  return playGeneratedTone(frequency, durationMs);
}

async function playSound(
  label: string,
  path: string,
  fallbackFrequency: number,
  fallbackDurationMs: number,
) {
  updateDiagnostics({
    lastSoundRequested: `${label} (${path})`,
    lastSoundResult: "idle",
    lastSoundDetail: "Playback requested.",
  });

  if (!getAppFeedbackSettings().soundsEnabled) {
    updateDiagnostics({
      lastSoundResult: "blocked",
      lastSoundDetail: "Sounds are disabled.",
    });
    return;
  }

  if (!(await unlockAppFeedback())) {
    updateDiagnostics({
      lastSoundResult: "blocked",
      lastSoundDetail: "Audio is not unlocked.",
    });
    return;
  }

  try {
    const context = getAudioContext();
    if (!context) {
      throw new Error("WebAudio is unavailable.");
    }

    let buffer = decodedAudioBuffers.get(path);
    if (!buffer) {
      const response = await fetch(path);
      if (!response.ok) {
        const fallbackPlayed = await playFallbackTone(
          fallbackFrequency,
          fallbackDurationMs,
        );
        updateDiagnostics({
          audioUnlocked: fallbackPlayed,
          lastSoundResult: "missing",
          lastSoundDetail: fallbackPlayed
            ? `MP3 returned ${response.status}; fallback tone played.`
            : `MP3 returned ${response.status}; fallback was blocked.`,
        });
        return;
      }

      buffer = await context.decodeAudioData(await response.arrayBuffer());
      decodedAudioBuffers.set(path, buffer);
    }

    const source = context.createBufferSource();
    const gain = context.createGain();
    gain.gain.value = 0.45;
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(context.destination);
    source.start();
    updateDiagnostics({
      audioUnlocked: true,
      lastSoundResult: "played",
      lastSoundDetail: path,
    });
  } catch (error) {
    const fallbackPlayed = await playFallbackTone(
      fallbackFrequency,
      fallbackDurationMs,
    );
    updateDiagnostics({
      audioUnlocked: fallbackPlayed,
      lastSoundResult: "error",
      lastSoundDetail: `${
        error instanceof Error ? error.message : "MP3 playback failed."
      }${fallbackPlayed ? " Fallback tone played." : " Fallback was blocked."}`,
    });
  }
}

function choosePooledSound(poolName: keyof typeof soundPools) {
  const pool = soundPools[poolName];
  const previousSelection = previousPoolSelections.get(poolName);
  const choices =
    pool.length > 1
      ? pool.filter((path) => path !== previousSelection)
      : [...pool];
  const selection =
    choices[Math.floor(Math.random() * choices.length)] ?? pool[0];

  previousPoolSelections.set(poolName, selection);
  return selection;
}

export async function testAppFeedbackSound() {
  updateDiagnostics({
    lastSoundRequested: "Test Sound (WebAudio tone)",
    lastSoundResult: "idle",
    lastSoundDetail: "Attempting audio unlock.",
  });

  if (!(await unlockAppFeedback())) {
    updateDiagnostics({
      lastSoundResult: "blocked",
      lastSoundDetail: "The browser blocked the test sound.",
    });
    return false;
  }

  const played = await playGeneratedTone(640, 160, 0.06);
  updateDiagnostics({
    audioUnlocked: played,
    lastSoundResult: played ? "played" : "error",
    lastSoundDetail: played
      ? "WebAudio test tone played."
      : "WebAudio test tone failed.",
  });
  return played;
}

export function playUiClick() {
  void playSound("UI Click", soundPaths.uiClick, 520, 55);
}

export function playSuccess() {
  void playSound("Success", soundPaths.success, 720, 120);
}

export function playWarning() {
  void playSound("Warning", soundPaths.warning, 330, 160);
}

export function playDirectorAttention() {
  void playSound(
    "Director Assistance Needed",
    soundPaths.directorAssistanceNeeded,
    440,
    220,
  );
}

export function playAdditionalTechRequested() {
  void playSound(
    "Additional Tech Requested",
    choosePooledSound("additionalTechRequested"),
    390,
    220,
  );
}

export function playVerificationRequested() {
  void playSound(
    "Verification Requested",
    choosePooledSound("verificationRequested"),
    660,
    220,
  );
}

export function vibrate(pattern: number | number[]) {
  if (
    !isBrowser() ||
    !getAppFeedbackSettings().vibrationEnabled ||
    !("vibrate" in navigator)
  ) {
    return;
  }

  try {
    navigator.vibrate(pattern);
  } catch {
    // Unsupported or blocked vibration should remain silent.
  }
}

export function isVibrationSupported() {
  return isBrowser() && "vibrate" in navigator;
}
