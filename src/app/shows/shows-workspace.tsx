"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import jsQR from "jsqr";
import {
  createSupabaseBrowserClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { NativeDateInput } from "@/components/native-date-input";
import {
  ActiveShow,
  getServerActiveShowSnapshot,
  readActiveShowSnapshot,
  setActiveShow,
  subscribeToActiveShowStore,
} from "@/components/active-show-strip";
import {
  getContinuitySessionPolicyMessage,
  setActiveContinuitySession,
  type ActiveContinuitySession,
  useActiveContinuitySession,
} from "@/components/active-continuity-session";
import {
  isValidTechnicianDisplayName,
  normalizeTechnicianDisplayName,
  setSelectedTemporaryTechnician,
  type TemporaryTechnicianId,
  useSelectedTemporaryTechnician,
} from "@/components/temporary-technician-store";
import { recordJoinedTechnician } from "@/components/collaboration-store";
import {
  SCRIPT_ADAPTERS,
  type ScriptAdapterKey,
  type ScriptParseResult,
} from "@/lib/script-adapters";
import {
  fetchScriptEventPreview,
  replaceScriptEvents,
  restoreScriptEvents,
  type ScriptEventRow,
} from "@/lib/script-events";
import { playTechnicianJoined } from "@/lib/app-feedback";

type ShowMode = "scripted" | "manual";
type FiringSystem = ScriptAdapterKey;
type ShowsView = "landing" | "create" | "library";

type ShowRecord = {
  id: string;
  company_id: string | null;
  name: string;
  show_code: string | null;
  location: string | null;
  show_date: string | null;
  show_mode: ShowMode;
  firing_system: FiringSystem | null;
  script_adapter: ScriptAdapterKey | null;
  script_filename: string | null;
  script_uploaded_at: string | null;
  status: string | null;
  created_by_user_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ContinuitySessionRecord = ActiveContinuitySession & {
  ended_at: string | null;
  created_at?: string | null;
};

type ScriptEventPreview = {
  count: number;
  rows: ScriptEventRow[];
};

const fieldClassName =
  "rounded-lg border border-[#334155] bg-[#020617] px-3 py-3 text-base font-semibold text-white placeholder:text-[#94a3b8] focus:border-[#8b5cf6] focus:outline-none focus:ring-2 focus:ring-[#4c00a4]/60";

const firingSystemLabels: Record<FiringSystem, string> = {
  cobra_6x: "COBRA 6.X",
  cobra_7x: "COBRA 7.X",
};

const SHOW_CODE_CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateShowCode() {
  const randomValues = new Uint32Array(4);
  window.crypto.getRandomValues(randomValues);

  return Array.from(
    randomValues,
    (value) => SHOW_CODE_CHARACTERS[value % SHOW_CODE_CHARACTERS.length],
  ).join("");
}

function normalizeJoinCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);
}

type DetectedBarcode = {
  rawValue?: string;
};

type BarcodeDetectorInstance = {
  detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]>;
};

type BarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorInstance;

function getBarcodeDetectorConstructor() {
  if (typeof window === "undefined") {
    return null;
  }

  return (
    (window as Window & {
      BarcodeDetector?: BarcodeDetectorConstructor;
    }).BarcodeDetector ?? null
  );
}

function extractJoinCodeFromQr(value: string) {
  const trimmed = value.trim();

  try {
    const parsedUrl = new URL(trimmed);
    const codeFromUrl = parsedUrl.searchParams.get("code");

    if (codeFromUrl) {
      const normalizedCode = normalizeJoinCode(codeFromUrl);
      return normalizedCode.length === 4 ? normalizedCode : null;
    }
  } catch {
    // Raw codes are expected too.
  }

  const normalizedRawCode = normalizeJoinCode(trimmed);
  if (normalizedRawCode.length === 4) {
    return normalizedRawCode;
  }

  const match = trimmed.toUpperCase().match(/\b[A-Z0-9]{4}\b/);
  return match ? normalizeJoinCode(match[0]) : null;
}

function formatShowDate(showDate: string | null) {
  if (!showDate) {
    return "Date not set";
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${showDate}T00:00:00`));
}

function formatScriptTimestamp(uploadedAt: string | null) {
  if (!uploadedAt) {
    return "Not uploaded";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(uploadedAt));
}

function formatSessionDate(timestamp: string | null | undefined) {
  if (!timestamp) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

export function ShowsWorkspace() {
  if (!isSupabaseConfigured) {
    return (
      <>
        <div className="md:hidden">
          <MobileTechnicianEntry
            isEntering={false}
            message={null}
            onContinue={() => undefined}
            onSelectTechnician={() => undefined}
            selectedTechnician="tech_1"
            supabaseConfigured={false}
          />
        </div>
        <div className="hidden px-8 py-10 md:block">
          <p className="rounded-lg border border-[#ef4444]/40 bg-[#2a0b13] p-5 font-semibold text-[#fecaca]">
            Supabase is not configured on this device/session.
          </p>
        </div>
      </>
    );
  }

  return <ConfiguredShowsWorkspace />;
}

function ConfiguredShowsWorkspace() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const [shows, setShows] = useState<ShowRecord[]>([]);
  const activeShow = useSyncExternalStore(
    subscribeToActiveShowStore,
    readActiveShowSnapshot,
    getServerActiveShowSnapshot,
  );
  const activeSession = useActiveContinuitySession();
  const selectedTechnician = useSelectedTemporaryTechnician();
  const [isEnteringTechnicianConsole, setIsEnteringTechnicianConsole] =
    useState(false);
  const [mobileEntryMessage, setMobileEntryMessage] = useState<string | null>(
    null,
  );
  const [name, setName] = useState("");
  const [showMode, setShowMode] = useState<ShowMode>("scripted");
  const [showDate, setShowDate] = useState("");
  const [location, setLocation] = useState("");
  const [firingSystem, setFiringSystem] = useState<FiringSystem | "">("");
  const [newShowScriptFile, setNewShowScriptFile] = useState<File | null>(
    null,
  );
  const [newShowParseResult, setNewShowParseResult] =
    useState<ScriptParseResult | null>(null);
  const [showsView, setShowsView] = useState<ShowsView>("landing");
  const [deleteCandidate, setDeleteCandidate] =
    useState<ShowRecord | null>(null);
  const [onboardingShow, setOnboardingShow] =
    useState<ShowRecord | null>(null);
  const [expandedShowId, setExpandedShowId] = useState<string | null>(
    null,
  );
  const [librarySessions, setLibrarySessions] = useState<
    Record<string, ContinuitySessionRecord[]>
  >({});
  const [loadingLibrarySessionShowId, setLoadingLibrarySessionShowId] =
    useState<string | null>(null);
  const [librarySessionErrors, setLibrarySessionErrors] = useState<
    Record<string, string>
  >({});
  const [scriptEventPreviews, setScriptEventPreviews] = useState<
    Record<string, ScriptEventPreview>
  >({});
  const [scriptEventPreviewErrors, setScriptEventPreviewErrors] = useState<
    Record<string, string>
  >({});
  const [loadingScriptEventShowId, setLoadingScriptEventShowId] =
    useState<string | null>(null);
  const [previousSessions, setPreviousSessions] = useState<
    ContinuitySessionRecord[]
  >([]);
  const [onboardingActiveSession, setOnboardingActiveSession] =
    useState<ContinuitySessionRecord | null>(null);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [updatingShowId, setUpdatingShowId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(
    null,
  );
  const [sessionName, setSessionName] = useState("");
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);

  const parseScriptFile = async (
    file: File,
    adapterKey: ScriptAdapterKey,
  ) => {
    const contents = await file.text();
    return SCRIPT_ADAPTERS[adapterKey].parse(contents);
  };

  const fetchShows = useCallback(async () => {
    return supabase
      .from("shows")
      .select(
        "id, company_id, name, show_code, location, show_date, show_mode, firing_system, script_adapter, script_filename, script_uploaded_at, status, created_by_user_id, created_at, updated_at",
      )
      .order("created_at", { ascending: false });
  }, [supabase]);

  const loadShows = async () => {
    setIsLoading(true);
    setMessage(null);

    const { data, error } = await fetchShows();

    if (error) {
      setMessage(`Could not load shows: ${error.message}`);
      setShows([]);
    } else {
      setShows((data ?? []) as ShowRecord[]);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    const loadInitialShows = async () => {
      const { data, error } = await fetchShows();

      if (error) {
        setMessage(`Could not load shows: ${error.message}`);
        setShows([]);
      } else {
        setShows((data ?? []) as ShowRecord[]);
      }

      setIsLoading(false);
    };

    void loadInitialShows();
  }, [fetchShows]);

  useEffect(() => {
    const loadActiveSession = async () => {
      if (!activeShow) {
        setActiveContinuitySession(null);
        return;
      }

      const { data, error } = await supabase
        .from("continuity_sessions")
        .select("id, show_id, name, status, started_at, ended_at")
        .eq("show_id", activeShow.id)
        .eq("status", "active")
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        setSessionMessage(
          getContinuitySessionPolicyMessage(
            `Could not load active continuity session: ${error.message}.`,
          ),
        );
        return;
      }

      setActiveContinuitySession(
        data ? (data as ContinuitySessionRecord) : null,
      );
    };

    void loadActiveSession();
  }, [activeShow, supabase]);

  function activateShow(show: ShowRecord) {
    const nextActiveShow: ActiveShow = {
      id: show.id,
      name: show.name,
      show_code: show.show_code,
      show_mode: show.show_mode,
      firing_system: show.firing_system,
      script_adapter: show.script_adapter,
      script_filename: show.script_filename,
      script_uploaded_at: show.script_uploaded_at,
    };

    if (activeShow?.id !== show.id) {
      setActiveContinuitySession(null);
    }

    setActiveShow(nextActiveShow);
  }

  async function openSessionOnboarding(show: ShowRecord) {
    activateShow(show);
    setOnboardingShow(show);
    setPreviousSessions([]);
    setOnboardingActiveSession(null);
    setSessionName("");
    setSessionMessage(null);
    setIsLoadingSessions(true);

    const { data, error } = await supabase
      .from("continuity_sessions")
      .select(
        "id, show_id, name, status, started_at, ended_at, created_at",
      )
      .eq("show_id", show.id)
      .order("started_at", { ascending: false });

    if (error) {
      setSessionMessage(
        getContinuitySessionPolicyMessage(
          `Could not load previous continuity sessions: ${error.message}.`,
        ),
      );
    } else {
      const sessions = (data ?? []) as ContinuitySessionRecord[];
      const currentSession =
        sessions.find(
          (session) =>
            session.status === "active" && session.ended_at === null,
        ) ?? null;

      setPreviousSessions(sessions);
      setOnboardingActiveSession(currentSession);

      if (currentSession) {
        setActiveContinuitySession(currentSession);
      }
    }

    setIsLoadingSessions(false);
  }

  async function loadScriptEventPreview(showId: string) {
    setLoadingScriptEventShowId(showId);
    setScriptEventPreviewErrors((currentErrors) => {
      const nextErrors = { ...currentErrors };
      delete nextErrors[showId];
      return nextErrors;
    });

    const { data, error, count } = await fetchScriptEventPreview(
      supabase,
      showId,
    );

    if (error) {
      setScriptEventPreviewErrors((currentErrors) => ({
        ...currentErrors,
        [showId]: `Could not load script events: ${error.message}`,
      }));
    } else {
      setScriptEventPreviews((currentPreviews) => ({
        ...currentPreviews,
        [showId]: {
          count: count ?? 0,
          rows: (data ?? []) as ScriptEventRow[],
        },
      }));
    }

    setLoadingScriptEventShowId(null);
  }

  async function toggleShowDetails(showId: string) {
    if (expandedShowId === showId) {
      setExpandedShowId(null);
      return;
    }

    setExpandedShowId(showId);

    const requests: Promise<void>[] = [];

    if (!librarySessions[showId]) {
      requests.push(
        (async () => {
          setLoadingLibrarySessionShowId(showId);
          setLibrarySessionErrors((currentErrors) => {
            const nextErrors = { ...currentErrors };
            delete nextErrors[showId];
            return nextErrors;
          });

          const { data, error } = await supabase
            .from("continuity_sessions")
            .select(
              "id, show_id, name, status, started_at, ended_at, created_at",
            )
            .eq("show_id", showId)
            .order("started_at", { ascending: false });

          if (error) {
            setLibrarySessionErrors((currentErrors) => ({
              ...currentErrors,
              [showId]: getContinuitySessionPolicyMessage(
                `Could not load previous continuity sessions: ${error.message}.`,
              ),
            }));
          } else {
            setLibrarySessions((currentSessions) => ({
              ...currentSessions,
              [showId]: (data ?? []) as ContinuitySessionRecord[],
            }));
          }

          setLoadingLibrarySessionShowId(null);
        })(),
      );
    }

    if (!scriptEventPreviews[showId]) {
      requests.push(loadScriptEventPreview(showId));
    }

    await Promise.all(requests);
  }

  const handleCreateShow = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();

    setMessage(null);
    setValidationMessage(null);

    if (!trimmedName) {
      setValidationMessage("Show Name is required.");
      return;
    }

    if (!showMode) {
      setValidationMessage("Show Type is required.");
      return;
    }

    setIsCreating(true);
    let parsedResult = newShowParseResult;

    try {
      if (firingSystem && newShowScriptFile) {
        parsedResult = await parseScriptFile(newShowScriptFile, firingSystem);
        setNewShowParseResult(parsedResult);

        if (parsedResult.errors.length > 0) {
          setMessage(`Script import failed: ${parsedResult.errors.join(" ")}`);
          setIsCreating(false);
          return;
        }
      }
    } catch (parseError) {
      setMessage(
        `Could not parse script: ${
          parseError instanceof Error
            ? parseError.message
            : "Unknown parser error"
        }`,
      );
      setIsCreating(false);
      return;
    }

    let data: ShowRecord | null = null;
    let creationError: { code?: string; message: string } | null = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = await supabase
        .from("shows")
        .insert({
          firing_system: firingSystem || null,
          location: location.trim() || null,
          name: trimmedName,
          script_adapter: null,
          script_filename: null,
          script_uploaded_at: null,
          show_code: generateShowCode(),
          show_date: showDate || null,
          show_mode: showMode,
        })
        .select(
          "id, company_id, name, show_code, location, show_date, show_mode, firing_system, script_adapter, script_filename, script_uploaded_at, status, created_by_user_id, created_at, updated_at",
        )
        .single();

      if (!result.error) {
        data = result.data as ShowRecord;
        creationError = null;
        break;
      }

      creationError = result.error;

      if (
        result.error.code !== "23505" ||
        !result.error.message.toLowerCase().includes("show_code")
      ) {
        break;
      }
    }

    if (creationError) {
      setMessage(`Could not create show: ${creationError.message}`);
    } else if (data) {
      let createdShow = data;
      let importedScriptEventCount: number | null = null;
      let skippedScriptRowCount = parsedResult?.skippedRowCount ?? 0;

      if (firingSystem && newShowScriptFile && parsedResult) {
        try {
          const replacement = await replaceScriptEvents(
            supabase,
            createdShow.id,
            parsedResult.rows,
          );
          importedScriptEventCount = replacement.insertedRowCount;
          skippedScriptRowCount += replacement.skippedRowCount;

          const uploadedAt = new Date().toISOString();
          const { data: updatedShowData, error: metadataError } =
            await supabase
              .from("shows")
              .update({
                firing_system: firingSystem,
                script_adapter: firingSystem,
                script_filename: newShowScriptFile.name,
                script_uploaded_at: uploadedAt,
              })
              .eq("id", createdShow.id)
              .select(
                "id, company_id, name, show_code, location, show_date, show_mode, firing_system, script_adapter, script_filename, script_uploaded_at, status, created_by_user_id, created_at, updated_at",
              )
              .single();

          if (metadataError) {
            throw new Error(
              `Script events were stored, but metadata could not be saved: ${metadataError.message}`,
            );
          }

          createdShow = updatedShowData as ShowRecord;
          setScriptEventPreviews((currentPreviews) => ({
            ...currentPreviews,
            [createdShow.id]: {
              count: replacement.insertedRowCount,
              rows: parsedResult.rows.slice(0, 5).map((row) => ({
                show_id: createdShow.id,
                channel_number: row.channel_number as number,
                cue_value: row.cue_value as string,
                position_name: row.position_name,
                effect_name: row.effect_name,
                raw_row: row.raw_row,
              })),
            },
          }));
        } catch (scriptError) {
          const { error: rollbackError } = await supabase
            .from("shows")
            .delete()
            .eq("id", createdShow.id);
          setMessage(
            rollbackError
              ? `Script import failed and the new show could not be rolled back: ${
                  scriptError instanceof Error
                    ? scriptError.message
                    : "Unknown script storage error"
                }; rollback failed: ${rollbackError.message}`
              : `Show creation was rolled back because the script import failed: ${
                  scriptError instanceof Error
                    ? scriptError.message
                    : "Unknown script storage error"
                }`,
          );
          setIsCreating(false);
          return;
        }
      }
      setShows((currentShows) => [createdShow, ...currentShows]);
      setName("");
      setShowMode("scripted");
      setShowDate("");
      setLocation("");
      setFiringSystem("");
      setNewShowScriptFile(null);
      setNewShowParseResult(null);
      setShowsView("landing");
      setMessage(
        importedScriptEventCount === null
          ? `Created and activated show: ${createdShow.name}`
          : `Created and activated show: ${createdShow.name}. Script imported successfully. ${importedScriptEventCount} events parsed.${
              skippedScriptRowCount > 0
                ? ` Skipped ${skippedScriptRowCount} blank or invalid script row(s).`
                : ""
            }`,
      );
      await openSessionOnboarding(createdShow);
    }

    setIsCreating(false);
  };

  const applyUpdatedShow = (updatedShow: ShowRecord) => {
    setShows((currentShows) =>
      currentShows.map((show) =>
        show.id === updatedShow.id ? updatedShow : show,
      ),
    );

    if (activeShow?.id === updatedShow.id) {
      activateShow(updatedShow);
    }
  };

  const handleUpdateFiringSystem = async (
    show: ShowRecord,
    nextFiringSystem: FiringSystem | "",
  ) => {
    setUpdatingShowId(show.id);
    setMessage(null);

    const { data, error } = await supabase
      .from("shows")
      .update({ firing_system: nextFiringSystem || null })
      .eq("id", show.id)
      .select(
        "id, company_id, name, show_code, location, show_date, show_mode, firing_system, script_adapter, script_filename, script_uploaded_at, status, created_by_user_id, created_at, updated_at",
      )
      .single();

    if (error) {
      setMessage(`Could not update firing system: ${error.message}`);
    } else {
      applyUpdatedShow(data as ShowRecord);
      setMessage(`Updated firing system for ${show.name}.`);
    }

    setUpdatingShowId(null);
  };

  const handleSelectExistingScript = async (
    show: ShowRecord,
    file: File | null,
  ) => {
    setMessage(null);

    if (!file || !show.firing_system) {
      return;
    }

    try {
      const result = await parseScriptFile(file, show.firing_system);

      if (result.errors.length > 0) {
        setMessage(`Script import failed: ${result.errors.join(" ")}`);
        return;
      }

      setUpdatingShowId(show.id);
      const replacement = await replaceScriptEvents(
        supabase,
        show.id,
        result.rows,
      );
      const uploadedAt = new Date().toISOString();
      const { data, error } = await supabase
        .from("shows")
        .update({
          firing_system: show.firing_system,
          script_adapter: show.firing_system,
          script_filename: file.name,
          script_uploaded_at: uploadedAt,
        })
        .eq("id", show.id)
        .select(
          "id, company_id, name, show_code, location, show_date, show_mode, firing_system, script_adapter, script_filename, script_uploaded_at, status, created_by_user_id, created_at, updated_at",
        )
        .single();

      if (error) {
        const restoreError = await restoreScriptEvents(
          supabase,
          show.id,
          replacement.previousRows,
        );
        setMessage(
          restoreError
            ? `Script metadata save failed, and previous script events could not be restored: ${error.message}; restore failed: ${restoreError.message}`
            : `Script metadata save failed. Previous script events were restored: ${error.message}`,
        );
      } else {
        applyUpdatedShow(data as ShowRecord);
        await loadScriptEventPreview(show.id);
        const skippedRowCount =
          result.skippedRowCount + replacement.skippedRowCount;
        setMessage(
          `Script imported successfully. ${replacement.insertedRowCount} events parsed.${
            skippedRowCount > 0
              ? ` Skipped ${skippedRowCount} blank or invalid script row(s).`
              : ""
          }`,
        );
      }
    } catch (error) {
      setMessage(
        `Could not parse script: ${
          error instanceof Error ? error.message : "Unknown parser error"
        }`,
      );
    } finally {
      setUpdatingShowId(null);
    }
  };

  const handleSelectNewShowScript = async (file: File | null) => {
    setNewShowScriptFile(file);
    setNewShowParseResult(null);
    setMessage(null);

    if (!file || !firingSystem) {
      return;
    }

    try {
      setNewShowParseResult(await parseScriptFile(file, firingSystem));
    } catch (error) {
      setMessage(
        `Could not parse script: ${
          error instanceof Error ? error.message : "Unknown parser error"
        }`,
      );
    }
  };

  const handleDeleteShow = async () => {
    if (!deleteCandidate) {
      return;
    }

    const show = deleteCandidate;
    setIsDeleting(true);
    setMessage(null);

    const stopDelete = (stage: string, errorMessage: string) => {
      setMessage(
        `Delete stopped while removing ${stage}: ${errorMessage}. Supabase may have blocked the operation with RLS or foreign-key constraints. No deletion success state was applied; refresh the library before retrying.`,
      );
      setIsDeleting(false);
    };

    const { data: issueRows, error: issueReadError } = await supabase
      .from("issues")
      .select("id")
      .eq("show_id", show.id);

    if (issueReadError) {
      stopDelete("associated issues", issueReadError.message);
      return;
    }

    const issueIds = (issueRows ?? []).map((issue) => issue.id as string);

    if (issueIds.length > 0) {
      const { error: historyDeleteError } = await supabase
        .from("issue_status_history")
        .delete()
        .in("issue_id", issueIds);

      if (historyDeleteError) {
        stopDelete("issue status history", historyDeleteError.message);
        return;
      }
    }

    const { error: issueDeleteError } = await supabase
      .from("issues")
      .delete()
      .eq("show_id", show.id);

    if (issueDeleteError) {
      stopDelete("issues", issueDeleteError.message);
      return;
    }

    const { error: sessionDeleteError } = await supabase
      .from("continuity_sessions")
      .delete()
      .eq("show_id", show.id);

    if (sessionDeleteError) {
      stopDelete("continuity sessions", sessionDeleteError.message);
      return;
    }

    const { error: showDeleteError } = await supabase
      .from("shows")
      .delete()
      .eq("id", show.id);

    if (showDeleteError) {
      stopDelete("the show", showDeleteError.message);
      return;
    }

    // Shared positions, maps, assignments, and notices use ON DELETE CASCADE.
    // TODO(field map storage): safely remove the show's Storage object after deletion.

    if (activeShow?.id === show.id) {
      setActiveShow(null);
    }

    if (activeSession?.show_id === show.id) {
      setActiveContinuitySession(null);
    }

    setShows((currentShows) =>
      currentShows.filter((currentShow) => currentShow.id !== show.id),
    );
    setLibrarySessions((currentSessions) => {
      const nextSessions = { ...currentSessions };
      delete nextSessions[show.id];
      return nextSessions;
    });
    setLibrarySessionErrors((currentErrors) => {
      const nextErrors = { ...currentErrors };
      delete nextErrors[show.id];
      return nextErrors;
    });
    setScriptEventPreviews((currentPreviews) => {
      const nextPreviews = { ...currentPreviews };
      delete nextPreviews[show.id];
      return nextPreviews;
    });
    setScriptEventPreviewErrors((currentErrors) => {
      const nextErrors = { ...currentErrors };
      delete nextErrors[show.id];
      return nextErrors;
    });
    if (expandedShowId === show.id) {
      setExpandedShowId(null);
    }
    setDeleteCandidate(null);
    setMessage(`Deleted show: ${show.name}`);
    setIsDeleting(false);
  };

  const handleStartSession = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    const trimmedName = sessionName.trim();

    setSessionMessage(null);

    if (!onboardingShow) {
      setSessionMessage("Select an active show before starting a session.");
      return;
    }

    if (!trimmedName) {
      setSessionMessage("Continuity Session Name is required.");
      return;
    }

    if (onboardingActiveSession) {
      setSessionMessage("End the current continuity session first.");
      return;
    }

    setIsStartingSession(true);

    const { data, error } = await supabase
      .from("continuity_sessions")
      .insert({
        name: trimmedName,
        show_id: onboardingShow.id,
        started_by_user_id: null,
        status: "active",
      })
      .select("id, show_id, name, status, started_at")
      .single();

    if (error) {
      setSessionMessage(
        getContinuitySessionPolicyMessage(
          `Could not start continuity session: ${error.message}.`,
        ),
      );
    } else if (data) {
      setActiveContinuitySession(data as ActiveContinuitySession);
      setSessionName("");
      setOnboardingShow(null);
      router.push("/director");
    }

    setIsStartingSession(false);
  };

  const continueToTechnicianConsole = async (showCode: string) => {
    const normalizedShowCode = normalizeJoinCode(showCode);
    const normalizedTechnicianName =
      normalizeTechnicianDisplayName(selectedTechnician);

    if (!/^[A-Z0-9]{4}$/.test(normalizedShowCode)) {
      setMobileEntryMessage("Enter a 4-character show code.");
      return;
    }

    if (!isValidTechnicianDisplayName(normalizedTechnicianName)) {
      setMobileEntryMessage(
        "Enter a 2-24 character name using letters, numbers, spaces, hyphen, or apostrophe.",
      );
      return;
    }

    setIsEnteringTechnicianConsole(true);
    setMobileEntryMessage(null);
    setSelectedTemporaryTechnician(normalizedTechnicianName);

    try {
      const { data: matchedShow, error: showError } = await supabase
        .from("shows")
        .select(
          "id, company_id, name, show_code, location, show_date, show_mode, firing_system, script_adapter, script_filename, script_uploaded_at, status, created_by_user_id, created_at, updated_at",
        )
        .eq("show_code", normalizedShowCode)
        .maybeSingle();

      if (showError) {
        const errorMessage = `Could not look up show: ${showError.message}`;
        setMobileEntryMessage(errorMessage);
        return;
      }

      if (!matchedShow) {
        setMobileEntryMessage("No show found for that code.");
        return;
      }

      const show = matchedShow as ShowRecord;
      activateShow(show);

      const { data: session, error: sessionError } = await supabase
        .from("continuity_sessions")
        .select("id, show_id, name, status, started_at")
        .eq("show_id", show.id)
        .eq("status", "active")
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sessionError) {
        setActiveContinuitySession(null);
        setMobileEntryMessage(
          `Could not check the active continuity session: ${sessionError.message}`,
        );
        return;
      }

      if (!session) {
        setActiveContinuitySession(null);
        setMobileEntryMessage(
          "Show found, but no active continuity session. Ask the Director to start one.",
        );
        return;
      }

      setActiveContinuitySession(session as ActiveContinuitySession);
      setSelectedTemporaryTechnician(normalizedTechnicianName);
      await recordJoinedTechnician({
        sessionId: (session as ActiveContinuitySession).id,
        showId: show.id,
        technicianId: normalizedTechnicianName,
      });
      playTechnicianJoined();
      router.push("/technician");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown join error.";
      setMobileEntryMessage(`Could not join show: ${errorMessage}`);
    } finally {
      setIsEnteringTechnicianConsole(false);
    }
  };

  return (
    <>
      <div className="md:hidden">
      <MobileTechnicianEntry
        isEntering={isEnteringTechnicianConsole}
        message={mobileEntryMessage}
        onContinue={(showCode) =>
          void continueToTechnicianConsole(showCode)
        }
        onSelectTechnician={(technicianId) => {
          setSelectedTemporaryTechnician(technicianId);
          setMobileEntryMessage(null);
        }}
        selectedTechnician={selectedTechnician}
        supabaseConfigured={isSupabaseConfigured}
      />
      </div>
      <div className="hidden md:block">
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 sm:px-8 lg:py-8">
      {showsView !== "landing" ? (
        <section className="rounded-lg border border-white/10 bg-[#0b1020]/90 p-6 shadow-2xl shadow-black/25">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#a78bfa]">
                Shows
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-normal text-white sm:text-4xl">
                {showsView === "create"
                  ? "Create new show"
                  : "Show library"}
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-[#b6c3d1]">
                {showsView === "create"
                  ? "Define the show, firing system, and optional script before field operations begin."
                  : "Review existing shows, manage script metadata, and select the active field workspace."}
              </p>
            </div>
            <button
            className="min-h-11 touch-manipulation rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-[#dbe4ef] transition hover:border-[#8b5cf6] hover:text-white active:border-[#8b5cf6] active:text-white"
              onClick={() => {
                setShowsView("landing");
                setMessage(null);
                setValidationMessage(null);
              }}
              type="button"
            >
              Back to Shows
            </button>
          </div>
        </section>
      ) : null}

      {message ? (
        <p className="rounded-lg border border-white/10 bg-[#070b18] p-3 text-sm text-[#dbe4ef]">
          {message}
        </p>
      ) : null}

      {showsView === "landing" ? (
        <section className="grid gap-4 md:grid-cols-2">
          <button
            className="group min-h-44 touch-manipulation rounded-lg border border-[#8b5cf6]/45 bg-[#17102c] p-6 text-left shadow-xl shadow-black/20 transition hover:border-[#a78bfa] hover:bg-[#1d1238] active:border-[#a78bfa] active:bg-[#1d1238]"
            onClick={() => {
              setMessage(null);
              setShowsView("create");
            }}
            type="button"
          >
            <span className="text-sm font-semibold uppercase tracking-[0.16em] text-[#a78bfa]">
              New workspace
            </span>
            <span className="mt-3 block text-2xl font-semibold text-white">
              Create New Show
            </span>
            <span className="mt-2 block text-sm leading-6 text-[#b6c3d1]">
              Set show mode, date, location, firing system, and script.
            </span>
          </button>
          <button
            className="group min-h-44 touch-manipulation rounded-lg border border-white/10 bg-[#0b1020]/90 p-6 text-left shadow-xl shadow-black/20 transition hover:border-[#8b5cf6] hover:bg-[#10172a] active:border-[#8b5cf6] active:bg-[#10172a]"
            onClick={() => {
              setMessage(null);
              setShowsView("library");
            }}
            type="button"
          >
            <span className="text-sm font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">
              Existing workspaces
            </span>
            <span className="mt-3 block text-2xl font-semibold text-white">
              Select Show
            </span>
            <span className="mt-2 block text-sm leading-6 text-[#b6c3d1]">
              Open the show library and choose the active display.
            </span>
          </button>
        </section>
      ) : null}

      {showsView === "create" ? (
        <form
          className="rounded-lg border border-white/10 bg-[#0b1020]/90 p-6 shadow-xl shadow-black/20"
          onSubmit={handleCreateShow}
        >
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">
            Supabase-backed form
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-white">New Show</h2>
          <div className="mt-6 grid gap-5">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-[#dbe4ef]">
                Show Name
              </span>
              <input
                className={fieldClassName}
                onChange={(event) => setName(event.target.value)}
                placeholder="Required"
                type="text"
                value={name}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-[#dbe4ef]">
                  Show Type
                </span>
                <select
                  className={fieldClassName}
                  onChange={(event) =>
                    setShowMode(event.target.value as ShowMode)
                  }
                  value={showMode}
                >
                  <option value="scripted">Scripted</option>
                  <option value="manual">Manual</option>
                </select>
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-semibold text-[#dbe4ef]">
                  Show Date
                </span>
                <NativeDateInput
                  className={fieldClassName}
                  onChange={(event) => setShowDate(event.target.value)}
                  value={showDate}
                />
              </label>
            </div>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-[#dbe4ef]">
                Firing System
              </span>
              <select
                className={fieldClassName}
                onChange={(event) => {
                  setFiringSystem(
                    event.target.value as FiringSystem | "",
                  );

                  if (!event.target.value) {
                    setNewShowScriptFile(null);
                    setNewShowParseResult(null);
                  }
                }}
                value={firingSystem}
              >
                <option value="">Not selected</option>
                {Object.values(SCRIPT_ADAPTERS).map((adapter) => (
                  <option key={adapter.key} value={adapter.key}>
                    {adapter.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-[#dbe4ef]">
                Location
              </span>
              <input
                className={fieldClassName}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Optional"
                type="text"
                value={location}
              />
            </label>
            {firingSystem ? (
              <div className="rounded-lg border border-dashed border-[#475569] bg-[#070b18] px-4 py-5">
                <p className="text-base font-semibold text-white">
                  Script Upload
                </p>
                <p className="mt-2 text-sm leading-6 text-[#94a3b8]">
                  Select a script to parse and store its events in Supabase with
                  the filename, upload timestamp, and COBRA adapter key.
                </p>
                <input
                  accept=".csv,text/csv"
                  className="mt-4 block w-full text-sm text-[#cbd5e1] file:mr-3 file:rounded-md file:border-0 file:bg-[#4c00a4] file:px-3 file:py-2 file:font-semibold file:text-white"
                  onChange={(event) =>
                    void handleSelectNewShowScript(
                      event.target.files?.[0] ?? null,
                    )
                  }
                  type="file"
                />
                {newShowParseResult ? (
                  <ScriptParseSummary result={newShowParseResult} />
                ) : null}
              </div>
            ) : null}
            {validationMessage ? (
              <p className="rounded-lg border border-[#f59e0b]/40 bg-[#2a1c06] p-3 text-sm font-semibold text-[#fde68a]">
                {validationMessage}
              </p>
            ) : null}
            <div className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-xl text-sm leading-6 text-[#94a3b8]">
                This creates a row in the existing `public.shows` table only.
              </p>
              <button
                className="rounded-lg bg-[#6d28d9] px-5 py-3 text-base font-semibold text-white shadow-lg shadow-[#4c00a4]/30 transition-colors hover:bg-[#7c3aed] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isCreating}
                type="submit"
              >
                {isCreating ? "Creating..." : "Create Show"}
              </button>
            </div>
          </div>
        </form>
      ) : null}

      {showsView === "library" ? (
        <section className="rounded-lg border border-white/10 bg-[#0b1020]/90 p-6 shadow-xl shadow-black/20">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">
                Supabase show list
              </p>
              <h2 className="mt-3 text-2xl font-semibold text-white">
                Select active show
              </h2>
            </div>
            <button
              className="min-h-11 touch-manipulation rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-[#dbe4ef] transition hover:border-[#8b5cf6] hover:text-white active:border-[#8b5cf6] active:text-white"
              onClick={() => void loadShows()}
              type="button"
            >
              Refresh
            </button>
          </div>

          <div className="mt-6 grid gap-4">
            {isLoading ? (
              <p className="rounded-lg border border-dashed border-[#475569] bg-[#070b18] p-5 text-sm text-[#94a3b8]">
                Loading shows from Supabase...
              </p>
            ) : shows.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[#475569] bg-[#070b18] p-5 text-sm text-[#94a3b8]">
                No shows found in Supabase yet.
              </p>
            ) : (
              shows.map((show) => {
                const isActive = activeShow?.id === show.id;
                const isExpanded = expandedShowId === show.id;
                const scriptEventPreview = scriptEventPreviews[show.id];
                const showSessions = librarySessions[show.id] ?? [];
                const isLoadingShowSessions =
                  loadingLibrarySessionShowId === show.id;
                const isLoadingScriptEvents =
                  loadingScriptEventShowId === show.id;

                return (
                  <article
                    className={`overflow-hidden rounded-lg border ${
                      isActive
                        ? "border-[#8b5cf6] bg-[#17102c]"
                        : "border-white/10 bg-[#070b18]"
                    }`}
                    key={show.id}
                  >
                    <div className="flex min-h-16 items-stretch">
                      <button
                        aria-controls={`show-details-${show.id}`}
                        aria-expanded={isExpanded}
                        className="flex min-h-14 min-w-0 touch-manipulation flex-1 items-center gap-3 px-4 py-3 text-left transition hover:bg-white/5 active:bg-white/10"
                        onClick={() => void toggleShowDetails(show.id)}
                        type="button"
                      >
                        <span
                          aria-hidden="true"
                          className={`shrink-0 text-[#94a3b8] transition-transform ${
                            isExpanded ? "rotate-90" : ""
                          }`}
                        >
                          ›
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-base font-semibold text-white">
                            {show.name}
                          </span>
                          <span className="mt-1 block text-sm text-[#94a3b8]">
                            {formatShowDate(show.show_date)}
                          </span>
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center border-l border-white/10 px-3">
                        <button
                          className={`min-h-11 touch-manipulation rounded-md px-3 py-2 text-sm font-semibold transition ${
                            isActive
                              ? "border border-[#22c55e]/40 bg-[#082515] text-[#bbf7d0]"
                              : "bg-[#6d28d9] text-white hover:bg-[#7c3aed] active:bg-[#7c3aed]"
                          }`}
                          onClick={() => void openSessionOnboarding(show)}
                          type="button"
                        >
                          {isActive ? "Active Show" : "Set Active"}
                        </button>
                      </div>
                    </div>

                    {isExpanded ? (
                      <div
                        className="grid gap-5 border-t border-white/10 bg-black/15 p-5"
                        id={`show-details-${show.id}`}
                      >
                        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                          <div>
                            <dt className="text-[#64748b]">Location</dt>
                            <dd className="mt-1 text-[#dbe4ef]">
                              {show.location ?? "Not set"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[#64748b]">Show Type</dt>
                            <dd className="mt-1 capitalize text-[#dbe4ef]">
                              {show.show_mode}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[#64748b]">
                              Technician Join Code
                            </dt>
                            <dd className="mt-1 font-mono text-xl font-bold tracking-[0.2em] text-[#c4b5fd]">
                              {show.show_code ?? "Not assigned"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[#64748b]">Firing System</dt>
                            <dd className="mt-1 text-[#dbe4ef]">
                              {show.firing_system
                                ? firingSystemLabels[show.firing_system]
                                : "Not selected"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[#64748b]">
                              Script Filename
                            </dt>
                            <dd className="mt-1 break-words text-[#dbe4ef]">
                              {show.script_filename ?? "None"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[#64748b]">
                              Script Uploaded At
                            </dt>
                            <dd className="mt-1 text-[#dbe4ef]">
                              {formatScriptTimestamp(
                                show.script_uploaded_at,
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[#64748b]">Status</dt>
                            <dd className="mt-1 capitalize text-[#dbe4ef]">
                              {show.status ?? "Not set"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[#64748b]">Script Adapter</dt>
                            <dd className="mt-1 text-[#dbe4ef]">
                              {show.script_adapter ?? "None"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[#64748b]">Created</dt>
                            <dd className="mt-1 text-[#dbe4ef]">
                              {formatSessionDate(show.created_at)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[#64748b]">Updated</dt>
                            <dd className="mt-1 text-[#dbe4ef]">
                              {formatSessionDate(show.updated_at)}
                            </dd>
                          </div>
                        </dl>

                        <div className="border-t border-white/10 pt-4">
                          <h4 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#94a3b8]">
                            Previous Continuity Sessions
                          </h4>
                          {isLoadingShowSessions ? (
                            <p className="mt-3 text-sm text-[#94a3b8]">
                              Loading sessions...
                            </p>
                          ) : librarySessionErrors[show.id] ? (
                            <p className="mt-3 text-xs font-semibold leading-5 text-[#fde68a]">
                              {librarySessionErrors[show.id]}
                            </p>
                          ) : showSessions.length === 0 ? (
                            <p className="mt-3 text-sm text-[#64748b]">
                              No continuity sessions recorded.
                            </p>
                          ) : (
                            <ul className="mt-2 divide-y divide-white/10">
                              {showSessions.map((session) => (
                                <li
                                  className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between"
                                  key={session.id}
                                >
                                  <span className="font-semibold text-[#dbe4ef]">
                                    {session.name}
                                  </span>
                                  <span className="text-xs text-[#94a3b8]">
                                    {session.status} |{" "}
                                    {formatSessionDate(
                                      session.started_at ??
                                        session.created_at,
                                    )}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>

                      <label className="grid gap-2 text-sm font-semibold text-[#dbe4ef]">
                        Firing System
                        <select
                          className={fieldClassName}
                          disabled={updatingShowId === show.id}
                          onChange={(event) =>
                            void handleUpdateFiringSystem(
                              show,
                              event.target.value as FiringSystem | "",
                            )
                          }
                          value={show.firing_system ?? ""}
                        >
                          <option value="">Not selected</option>
                          {Object.values(SCRIPT_ADAPTERS).map((adapter) => (
                            <option key={adapter.key} value={adapter.key}>
                              {adapter.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      {show.firing_system ? (
                        <div className="rounded-lg border border-[#8b5cf6]/25 bg-[#130a2b]/55 p-4">
                          <p className="text-sm font-semibold text-white">
                            Script Upload
                          </p>
                          <p className="mt-1 text-xs leading-5 text-[#94a3b8]">
                            Parsed events and script metadata save to Supabase
                            automatically after a successful import.
                          </p>
                          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-4">
                            <div>
                              <dt className="text-[#64748b]">Filename</dt>
                              <dd className="mt-1 font-semibold text-[#dbe4ef]">
                                {show.script_filename ?? "None"}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-[#64748b]">Uploaded</dt>
                              <dd className="mt-1 font-semibold text-[#dbe4ef]">
                                {formatScriptTimestamp(
                                  show.script_uploaded_at,
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-[#64748b]">Adapter</dt>
                              <dd className="mt-1 font-semibold text-[#dbe4ef]">
                                {show.script_adapter ?? "None"}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-[#64748b]">Parsed Rows</dt>
                              <dd className="mt-1 font-semibold text-[#dbe4ef]">
                                {isLoadingScriptEvents
                                  ? "Loading..."
                                  : scriptEventPreview?.count ?? 0}
                              </dd>
                            </div>
                          </dl>
                          {scriptEventPreviewErrors[show.id] ? (
                            <p className="mt-3 text-xs font-semibold leading-5 text-[#fde68a]">
                              {scriptEventPreviewErrors[show.id]}
                            </p>
                          ) : scriptEventPreview ? (
                            <ScriptEventPreviewTable
                              rows={scriptEventPreview.rows}
                            />
                          ) : null}
                          <label className="mt-4 grid gap-2 text-xs font-semibold text-[#cbd5e1]">
                            Select Script File
                            <input
                              accept=".csv,text/csv"
                              className="block w-full text-sm text-[#cbd5e1] file:mr-3 file:rounded-md file:border-0 file:bg-[#4c00a4] file:px-3 file:py-2 file:font-semibold file:text-white"
                              disabled={updatingShowId === show.id}
                              onChange={(event) =>
                                void handleSelectExistingScript(
                                  show,
                                  event.target.files?.[0] ?? null,
                                )
                              }
                              type="file"
                            />
                          </label>
                        </div>
                      ) : null}
                        <div className="flex justify-end border-t border-white/10 pt-4">
                          <button
                            aria-label={`Delete ${show.name}`}
                            className="rounded-lg border border-[#ef4444]/45 bg-[#2a0b12] px-4 py-2 text-sm font-semibold text-[#fecaca] transition hover:border-[#f87171] hover:bg-[#3b0d17]"
                            onClick={() => setDeleteCandidate(show)}
                            type="button"
                          >
                            Delete Show
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>
        </section>
      ) : null}

      {onboardingShow ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-5"
          role="dialog"
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[#8b5cf6]/45 bg-[#0b1020] p-6 shadow-2xl shadow-black/60">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#a78bfa]">
              Continuity Session Setup
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-white">
              {onboardingShow.name}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#b6c3d1]">
              Name the continuity check before opening Director Console.
            </p>

            {isLoadingSessions ? (
              <p className="mt-5 rounded-lg border border-dashed border-[#475569] bg-[#070b18] p-4 text-sm text-[#94a3b8]">
                Loading continuity sessions...
              </p>
            ) : onboardingActiveSession ? (
              <div className="mt-5 rounded-lg border border-[#22c55e]/35 bg-[#082515] p-4">
                <p className="text-sm font-semibold text-[#bbf7d0]">
                  Active session: {onboardingActiveSession.name}
                </p>
                <p className="mt-1 text-xs text-[#94a3b8]">
                  Started {formatSessionDate(onboardingActiveSession.started_at)}
                </p>
              </div>
            ) : (
              <form className="mt-5 grid gap-4" onSubmit={handleStartSession}>
                <label className="grid gap-2 text-sm font-semibold text-[#dbe4ef]">
                  Continuity Session Name
                  <input
                    autoFocus
                    className={fieldClassName}
                    onChange={(event) => setSessionName(event.target.value)}
                    placeholder="Morning Continuity Check"
                    value={sessionName}
                  />
                </label>
                <button
                  className="rounded-lg bg-[#6d28d9] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#7c3aed] disabled:cursor-wait disabled:opacity-60"
                  disabled={isStartingSession}
                  type="submit"
                >
                  {isStartingSession ? "Starting..." : "Start Session"}
                </button>
              </form>
            )}

            {sessionMessage ? (
              <p className="mt-4 rounded-lg border border-[#f59e0b]/35 bg-[#2a1c06] p-3 text-xs font-semibold leading-5 text-[#fde68a]">
                {sessionMessage}
              </p>
            ) : null}

            {!isLoadingSessions ? (
              <div className="mt-6 border-t border-white/10 pt-5">
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#94a3b8]">
                  Previous Sessions
                </h3>
                {previousSessions.filter(
                  (session) => session.id !== onboardingActiveSession?.id,
                ).length === 0 ? (
                  <p className="mt-3 text-sm text-[#64748b]">
                    No previous continuity sessions for this show.
                  </p>
                ) : (
                  <ul className="mt-3 divide-y divide-white/10">
                    {previousSessions
                      .filter(
                        (session) =>
                          session.id !== onboardingActiveSession?.id,
                      )
                      .map((session) => (
                        <li
                          className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"
                          key={session.id}
                        >
                          <span className="font-semibold text-[#dbe4ef]">
                            {session.name}
                          </span>
                          <span className="text-xs text-[#94a3b8]">
                            {session.status} |{" "}
                            {formatSessionDate(
                              session.started_at ?? session.created_at,
                            )}
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-end">
              <button
                className="rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-[#cbd5e1] transition hover:border-[#8b5cf6] hover:text-white"
                disabled={isStartingSession}
                onClick={() => {
                  setOnboardingShow(null);
                  router.push("/director");
                }}
                type="button"
              >
                {onboardingActiveSession
                  ? "Continue to Director Console"
                  : "Skip for now / Start later"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteCandidate ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-5"
          role="dialog"
        >
          <div className="w-full max-w-lg rounded-lg border border-[#ef4444]/45 bg-[#0b1020] p-6 shadow-2xl shadow-black/60">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#fca5a5]">
              Delete Show
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-white">
              {deleteCandidate.name}
            </h2>
            <p className="mt-4 text-sm leading-6 text-[#dbe4ef]">
              Are you sure you want to delete this show? This will delete the
              show and all associated sessions, issues, script metadata, and
              local MVP data.
            </p>
            <div className="mt-6 flex justify-end gap-3 border-t border-white/10 pt-5">
              <button
                className="rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-[#dbe4ef] hover:border-[#8b5cf6]"
                disabled={isDeleting}
                onClick={() => setDeleteCandidate(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-lg bg-[#b91c1c] px-4 py-2 text-sm font-semibold text-white hover:bg-[#dc2626] disabled:cursor-wait disabled:opacity-60"
                disabled={isDeleting}
                onClick={() => void handleDeleteShow()}
                type="button"
              >
                {isDeleting ? "Deleting..." : "Delete Show"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
      </div>
    </>
  );
}

function MobileTechnicianEntry({
  isEntering,
  message,
  onContinue,
  onSelectTechnician,
  selectedTechnician,
  supabaseConfigured,
}: {
  isEntering: boolean;
  message: string | null;
  onContinue: (showCode: string) => void;
  onSelectTechnician: (technicianId: TemporaryTechnicianId) => void;
  selectedTechnician: TemporaryTechnicianId;
  supabaseConfigured: boolean;
}) {
  const [joinCode, setJoinCode] = useState("");
  const [technicianName, setTechnicianName] = useState(
    selectedTechnician.startsWith("tech_") ? "" : selectedTechnician,
  );
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const normalizedJoinCode = normalizeJoinCode(joinCode);
  const normalizedTechnicianName =
    normalizeTechnicianDisplayName(technicianName);
  const hasValidTechnicianName = isValidTechnicianDisplayName(
    normalizedTechnicianName,
  );
  const isJoinEnabled =
    joinCode.length === 4 && hasValidTechnicianName && !isEntering;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 py-5">
      <section className="rounded-xl border border-[#8b5cf6]/35 bg-[#0b1020]/95 p-5 shadow-2xl shadow-black/30">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#a78bfa]">
          Technician Entry
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-white">
          Join field operations
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#b6c3d1]">
          Enter the show code and your field display name. Show setup and
          session creation remain Director workflows on a desktop or laptop.
        </p>
      </section>

      <section className="rounded-xl border border-white/10 bg-[#0b1020]/95 p-4 shadow-xl shadow-black/20">
        <div className="flex min-h-11 items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#94a3b8]">
              Step 1
            </p>
            <h2 className="mt-1 text-lg font-semibold text-white">
              Enter Show Code
            </h2>
          </div>
          <button
            aria-label="Scan show code QR"
            className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-lg border border-[#8b5cf6]/35 bg-[#17102c] text-[#d8c8ff] active:bg-[#251447]"
            onClick={() => {
              setScannerError(null);
              setIsScannerOpen(true);
            }}
            type="button"
          >
            <svg
              aria-hidden="true"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3M8 8h3v3H8V8Zm5 0h3v3h-3V8Zm-5 5h3v3H8v-3Zm5 0h1.5M16 13v3M13 16h3"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
            </svg>
          </button>
        </div>

        <input
          aria-label="Enter Show Code"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          className="mt-4 min-h-16 w-full touch-manipulation rounded-xl border border-white/15 bg-[#070b18] px-4 py-3 text-center font-mono text-3xl font-bold uppercase tracking-[0.25em] text-white outline-none focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#4c00a4]/40"
          inputMode="text"
          maxLength={4}
          onChange={(event) =>
            setJoinCode(normalizeJoinCode(event.currentTarget.value))
          }
          placeholder="AB12"
          spellCheck={false}
          type="text"
          value={joinCode}
        />
        <p className="mt-2 text-xs leading-5 text-[#94a3b8]">
          Ask the Director for the four-character Technician Join Code.
        </p>
        {scannerError ? (
          <p className="mt-3 rounded-lg border border-[#f59e0b]/40 bg-[#2a1c06] p-3 text-xs font-semibold leading-5 text-[#fde68a]">
            {scannerError}
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-white/10 bg-[#0b1020]/95 p-4 shadow-xl shadow-black/20">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#94a3b8]">
          Step 2
        </p>
        <h2 className="mt-1 text-lg font-semibold text-white">
          Enter Your Name
        </h2>
        <input
          aria-label="Enter Your Name"
          autoCapitalize="words"
          autoComplete="name"
          className="mt-4 min-h-14 w-full touch-manipulation rounded-xl border border-white/15 bg-[#070b18] px-4 py-3 text-base font-semibold text-white outline-none focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#4c00a4]/40"
          maxLength={24}
          onChange={(event) => {
            setTechnicianName(event.currentTarget.value);
            onSelectTechnician(event.currentTarget.value);
          }}
          placeholder="Bo Domescik"
          type="text"
          value={technicianName}
        />
        <p className="mt-2 text-xs leading-5 text-[#94a3b8]">
          2-24 characters. Letters, numbers, spaces, hyphen, and apostrophe
          are allowed.
        </p>
      </section>

      {message ? (
        <p
          aria-live="polite"
          className="rounded-xl border border-[#f59e0b]/40 bg-[#2a1c06] p-4 text-sm font-semibold leading-6 text-[#fde68a]"
        >
          {message}
        </p>
      ) : null}

      <button
        className="min-h-14 touch-manipulation rounded-xl bg-[#6d28d9] px-5 py-4 text-lg font-bold text-white shadow-xl shadow-[#4c00a4]/30 transition active:scale-[0.99] active:bg-[#7c3aed] disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!isJoinEnabled}
        onClick={() => onContinue(normalizedJoinCode)}
        type="button"
      >
        {isEntering ? "Joining..." : "Join Technician Console"}
      </button>

      {!supabaseConfigured ? (
        <p className="text-center text-sm font-semibold text-[#fecaca]">
          Supabase is not configured on this device/session.
        </p>
      ) : null}

      {isScannerOpen ? (
        <QrScannerModal
          onClose={() => setIsScannerOpen(false)}
          onScan={(code) => {
            setJoinCode(code);
            setScannerError(null);
            setIsScannerOpen(false);
          }}
          onScanError={setScannerError}
        />
      ) : null}
    </div>
  );
}

function QrScannerModal({
  onClose,
  onScan,
  onScanError,
}: {
  onClose: () => void;
  onScan: (code: string) => void;
  onScanError: (message: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [status, setStatus] = useState("Starting camera...");

  useEffect(() => {
    let isCancelled = false;
    let intervalId: number | null = null;
    const canvas = document.createElement("canvas");
    const canvasContext = canvas.getContext("2d", {
      willReadFrequently: true,
    });

    const stopCamera = () => {
      if (intervalId) {
        window.clearInterval(intervalId);
        intervalId = null;
      }

      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };

    const failScanning = (message: string) => {
      if (isCancelled) {
        return;
      }

      setLocalError(message);
      onScanError(message);
    };

    const startScanning = async () => {
      const BarcodeDetector = getBarcodeDetectorConstructor();

      if (!navigator.mediaDevices?.getUserMedia) {
        failScanning(
          "Camera scanning unavailable. Enter the code manually.",
        );
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            height: { ideal: 1280 },
            width: { ideal: 720 },
          },
        });

        if (isCancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.muted = true;
          videoRef.current.playsInline = true;
          await videoRef.current.play();
        }

        const detector = BarcodeDetector
          ? new BarcodeDetector({ formats: ["qr_code"] })
          : null;
        setStatus("Point camera at the Director QR code.");

        intervalId = window.setInterval(async () => {
          const video = videoRef.current;

          if (
            !video ||
            video.readyState < 2 ||
            !video.videoWidth ||
            !video.videoHeight
          ) {
            return;
          }

          try {
            let rawValue: string | undefined;

            if (detector) {
              const detectedCodes = await detector.detect(video);
              rawValue = detectedCodes[0]?.rawValue;
            } else if (canvasContext) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              canvasContext.drawImage(video, 0, 0, canvas.width, canvas.height);
              const imageData = canvasContext.getImageData(
                0,
                0,
                canvas.width,
                canvas.height,
              );
              rawValue =
                jsQR(imageData.data, imageData.width, imageData.height)
                  ?.data ?? undefined;
            } else {
              failScanning(
                "Camera scanning unavailable. Enter the code manually.",
              );
              return;
            }

            if (!rawValue) {
              return;
            }

            const code = extractJoinCodeFromQr(rawValue);

            if (!code) {
              failScanning(
                "Invalid QR code. Scan the Director join code or enter it manually.",
              );
              return;
            }

            stopCamera();
            onScan(code);
          } catch (scanError) {
            console.error("QR scan failed", scanError);
            failScanning(
              "Camera scanning unavailable. Enter the code manually.",
            );
          }
        }, 350);
      } catch {
        failScanning(
          "Camera scanning unavailable. Enter the code manually.",
        );
      }
    };

    void startScanning();

    return () => {
      isCancelled = true;
      stopCamera();
    };
  }, [onScan, onScanError]);

  return (
    <div
      aria-labelledby="qr-scanner-title"
      aria-modal="true"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm md:hidden"
      role="dialog"
    >
      <section className="w-full max-w-md rounded-xl border border-[#8b5cf6]/45 bg-[#0b1020] p-4 shadow-2xl shadow-black/70">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#a78bfa]">
              QR Scanner
            </p>
            <h2
              className="mt-1 text-xl font-bold text-white"
              id="qr-scanner-title"
            >
              Scan Show Code
            </h2>
          </div>
          <button
            aria-label="Close QR scanner"
            className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-lg border border-white/15 text-white active:bg-white/10"
            onClick={onClose}
            type="button"
          >
            X
          </button>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-black">
          <video
            autoPlay
            className="aspect-[3/4] w-full object-cover"
            muted
            playsInline
            ref={videoRef}
          />
        </div>

        <p className="mt-3 text-sm font-semibold text-[#cbd5e1]">
          {localError ?? status}
        </p>
        {localError ? (
          <p className="mt-2 rounded-lg border border-[#f59e0b]/40 bg-[#2a1c06] p-3 text-xs font-semibold leading-5 text-[#fde68a]">
            Camera scanning unavailable. Enter the code manually.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function ScriptParseSummary({ result }: { result: ScriptParseResult }) {
  return (
    <div className="mt-4 border-t border-white/10 pt-4">
      <p className="text-sm font-semibold text-white">
        Parsed rows: {result.rows.length}
      </p>
      {result.errors.length > 0 ? (
        <ul className="mt-2 grid gap-1 text-xs font-semibold text-[#fecaca]">
          {result.errors.map((error) => (
            <li key={error}>Error: {error}</li>
          ))}
        </ul>
      ) : null}
      {result.warnings.length > 0 ? (
        <ul className="mt-2 grid gap-1 text-xs font-semibold text-[#fde68a]">
          {result.warnings.map((warning) => (
            <li key={warning}>Warning: {warning}</li>
          ))}
        </ul>
      ) : null}
      {result.rows.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-xs">
            <thead className="border-b border-white/10 uppercase text-[#64748b]">
              <tr>
                <th className="py-2 pr-3 font-semibold">CH</th>
                <th className="px-3 py-2 font-semibold">Cue</th>
                <th className="px-3 py-2 font-semibold">Position</th>
                <th className="py-2 pl-3 font-semibold">Effect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 text-[#dbe4ef]">
              {result.rows.slice(0, 5).map((row, index) => (
                <tr key={`${row.channel_number}-${row.cue_value}-${index}`}>
                  <td className="py-2 pr-3">{row.channel_number ?? "-"}</td>
                  <td className="px-3 py-2">{row.cue_value ?? "-"}</td>
                  <td className="px-3 py-2">{row.position_name ?? "-"}</td>
                  <td className="py-2 pl-3">{row.effect_name ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function ScriptEventPreviewTable({ rows }: { rows: ScriptEventRow[] }) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 overflow-x-auto border-t border-white/10 pt-4">
      <table className="w-full min-w-[32rem] text-left text-xs">
        <thead className="border-b border-white/10 uppercase text-[#64748b]">
          <tr>
            <th className="py-2 pr-3 font-semibold">CH</th>
            <th className="px-3 py-2 font-semibold">Cue</th>
            <th className="px-3 py-2 font-semibold">Position</th>
            <th className="py-2 pl-3 font-semibold">Effect</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10 text-[#dbe4ef]">
          {rows.map((row) => (
            <tr key={row.id ?? `${row.channel_number}-${row.cue_value}`}>
              <td className="py-2 pr-3">{row.channel_number}</td>
              <td className="px-3 py-2">{row.cue_value}</td>
              <td className="px-3 py-2">{row.position_name ?? "-"}</td>
              <td className="py-2 pl-3">{row.effect_name ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
