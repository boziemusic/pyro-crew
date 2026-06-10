"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { NativeDateInput } from "@/components/native-date-input";
import {
  ACTIVE_SHOW_EVENT,
  ACTIVE_SHOW_STORAGE_KEY,
  ActiveShow,
  getServerActiveShowSnapshot,
  readActiveShowSnapshot,
  subscribeToActiveShowStore,
} from "@/components/active-show-strip";
import {
  getContinuitySessionPolicyMessage,
  setActiveContinuitySession,
  type ActiveContinuitySession,
  useActiveContinuitySession,
} from "@/components/active-continuity-session";
import { deleteShowPositionData } from "@/components/position-store";
import { removeResolutionNoticeAcknowledgements } from "@/components/resolution-notice-store";
import { removeTemporaryHandoffsForShow } from "@/components/temporary-handoff-store";
import { removeTemporaryTechnicianData } from "@/components/temporary-technician-store";
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

type ShowMode = "scripted" | "manual";
type FiringSystem = ScriptAdapterKey;
type ShowsView = "landing" | "create" | "library";

type ShowRecord = {
  id: string;
  company_id: string | null;
  name: string;
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
};

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

function writeActiveShow(show: ActiveShow | null) {
  if (show) {
    window.localStorage.setItem(ACTIVE_SHOW_STORAGE_KEY, JSON.stringify(show));
  } else {
    window.localStorage.removeItem(ACTIVE_SHOW_STORAGE_KEY);
  }

  window.dispatchEvent(new Event(ACTIVE_SHOW_EVENT));
}

export function ShowsWorkspace() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const [shows, setShows] = useState<ShowRecord[]>([]);
  const activeShow = useSyncExternalStore(
    subscribeToActiveShowStore,
    readActiveShowSnapshot,
    getServerActiveShowSnapshot,
  );
  const activeSession = useActiveContinuitySession();
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
        "id, company_id, name, location, show_date, show_mode, firing_system, script_adapter, script_filename, script_uploaded_at, status, created_by_user_id, created_at, updated_at",
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
      show_mode: show.show_mode,
      firing_system: show.firing_system,
      script_adapter: show.script_adapter,
      script_filename: show.script_filename,
      script_uploaded_at: show.script_uploaded_at,
    };

    if (activeShow?.id !== show.id) {
      setActiveContinuitySession(null);
    }

    writeActiveShow(nextActiveShow);
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

    const { data, error } = await supabase
      .from("shows")
      .insert({
        firing_system: firingSystem || null,
        location: location.trim() || null,
        name: trimmedName,
        script_adapter: null,
        script_filename: null,
        script_uploaded_at: null,
        show_date: showDate || null,
        show_mode: showMode,
      })
      .select(
        "id, company_id, name, location, show_date, show_mode, firing_system, script_adapter, script_filename, script_uploaded_at, status, created_by_user_id, created_at, updated_at",
      )
      .single();

    if (error) {
      setMessage(`Could not create show: ${error.message}`);
    } else if (data) {
      let createdShow = data as ShowRecord;
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
                "id, company_id, name, location, show_date, show_mode, firing_system, script_adapter, script_filename, script_uploaded_at, status, created_by_user_id, created_at, updated_at",
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
        "id, company_id, name, location, show_date, show_mode, firing_system, script_adapter, script_filename, script_uploaded_at, status, created_by_user_id, created_at, updated_at",
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
          "id, company_id, name, location, show_date, show_mode, firing_system, script_adapter, script_filename, script_uploaded_at, status, created_by_user_id, created_at, updated_at",
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

    deleteShowPositionData(show.id);
    removeTemporaryTechnicianData(issueIds);
    removeTemporaryHandoffsForShow(show.id);
    removeResolutionNoticeAcknowledgements(issueIds);

    if (activeShow?.id === show.id) {
      writeActiveShow(null);
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

  return (
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
              className="rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-[#dbe4ef] transition hover:border-[#8b5cf6] hover:text-white"
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
            className="group rounded-lg border border-[#8b5cf6]/45 bg-[#17102c] p-6 text-left shadow-xl shadow-black/20 transition hover:border-[#a78bfa] hover:bg-[#1d1238]"
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
            className="group rounded-lg border border-white/10 bg-[#0b1020]/90 p-6 text-left shadow-xl shadow-black/20 transition hover:border-[#8b5cf6] hover:bg-[#10172a]"
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
                <option value="cobra_6x">COBRA 6.X</option>
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
              className="rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-[#dbe4ef] transition hover:border-[#8b5cf6] hover:text-white"
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
                        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition hover:bg-white/5"
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
                          className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                            isActive
                              ? "border border-[#22c55e]/40 bg-[#082515] text-[#bbf7d0]"
                              : "bg-[#6d28d9] text-white hover:bg-[#7c3aed]"
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
                          <option value="cobra_6x">COBRA 6.X</option>
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
