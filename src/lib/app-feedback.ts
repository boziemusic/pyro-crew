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
  soundsEnabled: true,
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
  directorTechJoined: [
    "/sounds/director-tech-joined-1.mp3",
    "/sounds/director-tech-joined-2.mp3",
    "/sounds/director-tech-joined-3.mp3",
  ],
  techJoined: [
    "/sounds/tech-joined-1.mp3",
    "/sounds/tech-joined-2.mp3",
    "/sounds/tech-joined-3.mp3",
  ],
  techInitialIssueAssignment: [
    "/sounds/tech-initial-issue-assignment-1.mp3",
    "/sounds/tech-initial-issue-assignment-2.mp3",
    "/sounds/tech-initial-issue-assignment-3.mp3",
  ],
  techFixVerified: [
    "/sounds/tech-fix-verified-1.mp3",
    "/sounds/tech-fix-verified-2.mp3",
    "/sounds/tech-fix-verified-3.mp3",
  ],
  techAdditionalHelperAssigned: [
    "/sounds/tech-additionaltechrequested-helpertech-1.mp3",
    "/sounds/tech-additionaltechrequested-helpertech-2.mp3",
    "/sounds/tech-additionaltechrequested-helpertech-3.mp3",
  ],
  techAdditionalRequestAccepted: [
    "/sounds/tech-additionaltechrequested-accepted-1.mp3",
    "/sounds/tech-additionaltechrequested-accepted-2.mp3",
    "/sounds/tech-additionaltechrequested-accepted-3.mp3",
  ],
  techAdditionalRequestDeclined: [
    "/sounds/tech-additionaltechrequested-declined-1.mp3",
    "/sounds/tech-additionaltechrequested-declined-2.mp3",
    "/sounds/tech-additionaltechrequested-declined-3.mp3",
  ],
  techRetrievingParts: [
    "/sounds/tech-retrievingparts-1.mp3",
    "/sounds/tech-retrievingparts-2.mp3",
    "/sounds/tech-retrievingparts-3.mp3",
  ],
  techNotFixed: [
    "/sounds/tech-fix-notfixed-1.mp3",
    "/sounds/tech-fix-notfixed-2.mp3",
    "/sounds/tech-fix-notfixed-3.mp3",
  ],
  techUnfixable: [
    "/sounds/tech-unfixable-1.mp3",
    "/sounds/tech-unfixable-2.mp3",
    "/sounds/tech-unfixable-3.mp3",
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

  const AudioContextConstructor =
    window.AudioContext ??
    (
      window as Window &
        typeof globalThis & {
          webkitAudioContext?: typeof AudioContext;
        }
    ).webkitAudioContext;

  if (!AudioContextConstructor) {
    return null;
  }

  audioContext ??= new AudioContextConstructor();
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
  options: { ignoreSettings?: boolean } = {},
) {
  updateDiagnostics({
    lastSoundRequested: `${label} (${path})`,
    lastSoundResult: "idle",
    lastSoundDetail: "Playback requested.",
  });

  if (
    !options.ignoreSettings &&
    !getAppFeedbackSettings().soundsEnabled
  ) {
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

export function playUiClick() {
  void playSound("UI Click", soundPaths.uiClick, 520, 55);
}

export function playChatMessage() {
  if (!getAppFeedbackSettings().soundsEnabled) {
    return;
  }

  void unlockAppFeedback().then((unlocked) => {
    if (unlocked) {
      void playGeneratedTone(620, 85, 0.025);
    }
  });
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

export function playDirectorTechJoined() {
  void playSound(
    "Technician Joined",
    choosePooledSound("directorTechJoined"),
    580,
    180,
  );
}

export function playTechnicianJoined() {
  void playSound(
    "Joined Session",
    choosePooledSound("techJoined"),
    700,
    180,
  );
}

export function playTechnicianInitialIssueAssignment() {
  void playSound(
    "Initial Issue Assignment",
    choosePooledSound("techInitialIssueAssignment"),
    520,
    180,
  );
}

export function playTechnicianFixVerified() {
  void playSound(
    "Fix Verified",
    choosePooledSound("techFixVerified"),
    760,
    220,
  );
}

export function playTechAdditionalHelperAssigned() {
  void playSound(
    "Additional Helper Assignment",
    choosePooledSound("techAdditionalHelperAssigned"),
    610,
    220,
  );
}

export function playTechAdditionalRequestAccepted() {
  void playSound(
    "Additional Tech Request Accepted",
    choosePooledSound("techAdditionalRequestAccepted"),
    640,
    220,
  );
}

export function playTechAdditionalRequestDeclined() {
  void playSound(
    "Additional Tech Request Declined",
    choosePooledSound("techAdditionalRequestDeclined"),
    300,
    220,
  );
}

export function playTechRetrievingParts() {
  void playSound(
    "Retrieving Parts",
    choosePooledSound("techRetrievingParts"),
    470,
    220,
  );
}

export function playTechNotFixed() {
  void playSound(
    "Not Fixed",
    choosePooledSound("techNotFixed"),
    260,
    240,
  );
}

export function playTechUnfixable() {
  void playSound(
    "Unfixable",
    choosePooledSound("techUnfixable"),
    220,
    260,
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
