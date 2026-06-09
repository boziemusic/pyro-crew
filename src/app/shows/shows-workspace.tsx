"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import {
  ACTIVE_SHOW_EVENT,
  ACTIVE_SHOW_NEUTRAL_SECONDARY_TEXT,
  ACTIVE_SHOW_NEUTRAL_SURFACE,
  ACTIVE_SHOW_STORAGE_KEY,
  ACTIVE_SHOW_SUCCESS_SECONDARY_TEXT,
  ACTIVE_SHOW_SUCCESS_SURFACE,
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
import type { ScriptAdapterKey } from "@/lib/script-adapters";

type ShowMode = "scripted" | "manual";
type FiringSystem = ScriptAdapterKey;

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
  const [scriptFiles, setScriptFiles] = useState<Record<string, File | null>>(
    {},
  );
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

    const { data, error } = await supabase
      .from("shows")
      .insert({
        firing_system: firingSystem || null,
        location: location.trim() || null,
        name: trimmedName,
        script_adapter:
          firingSystem && newShowScriptFile ? firingSystem : null,
        script_filename: newShowScriptFile?.name ?? null,
        script_uploaded_at: newShowScriptFile
          ? new Date().toISOString()
          : null,
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
      const createdShow = data as ShowRecord;
      setShows((currentShows) => [createdShow, ...currentShows]);
      setName("");
      setShowMode("scripted");
      setShowDate("");
      setLocation("");
      setFiringSystem("");
      setNewShowScriptFile(null);
      setMessage(`Created show: ${createdShow.name}`);
    }

    setIsCreating(false);
  };

  const handleSetActiveShow = (show: ShowRecord) => {
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
  };

  const handleClearActiveShow = () => {
    setActiveContinuitySession(null);
    writeActiveShow(null);
  };

  const applyUpdatedShow = (updatedShow: ShowRecord) => {
    setShows((currentShows) =>
      currentShows.map((show) =>
        show.id === updatedShow.id ? updatedShow : show,
      ),
    );

    if (activeShow?.id === updatedShow.id) {
      handleSetActiveShow(updatedShow);
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

  const handleSaveScriptMetadata = async (show: ShowRecord) => {
    const scriptFile = scriptFiles[show.id];

    if (!show.firing_system || !scriptFile) {
      setMessage("Select a script file before saving its metadata.");
      return;
    }

    setUpdatingShowId(show.id);
    setMessage(null);

    const { data, error } = await supabase
      .from("shows")
      .update({
        script_adapter: show.firing_system,
        script_filename: scriptFile.name,
        script_uploaded_at: new Date().toISOString(),
      })
      .eq("id", show.id)
      .select(
        "id, company_id, name, location, show_date, show_mode, firing_system, script_adapter, script_filename, script_uploaded_at, status, created_by_user_id, created_at, updated_at",
      )
      .single();

    if (error) {
      setMessage(`Could not save script metadata: ${error.message}`);
    } else {
      applyUpdatedShow(data as ShowRecord);
      setScriptFiles((currentFiles) => ({
        ...currentFiles,
        [show.id]: null,
      }));
      setMessage(`Saved script metadata for ${show.name}.`);
    }

    setUpdatingShowId(null);
  };

  const handleStartSession = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    const trimmedName = sessionName.trim();

    setSessionMessage(null);

    if (!activeShow) {
      setSessionMessage("Select an active show before starting a session.");
      return;
    }

    if (!trimmedName) {
      setSessionMessage("Continuity Session Name is required.");
      return;
    }

    if (activeSession?.show_id === activeShow.id) {
      setSessionMessage("End the current continuity session first.");
      return;
    }

    setIsStartingSession(true);

    const { data, error } = await supabase
      .from("continuity_sessions")
      .insert({
        name: trimmedName,
        show_id: activeShow.id,
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
      setSessionMessage(`Started continuity session: ${data.name}`);
    }

    setIsStartingSession(false);
  };

  const activeShowSurfaceClassName = activeShow
    ? ACTIVE_SHOW_SUCCESS_SURFACE
    : ACTIVE_SHOW_NEUTRAL_SURFACE;
  const activeShowSecondaryTextClassName = activeShow
    ? ACTIVE_SHOW_SUCCESS_SECONDARY_TEXT
    : ACTIVE_SHOW_NEUTRAL_SECONDARY_TEXT;
  const sessionForActiveShow =
    activeSession?.show_id === activeShow?.id ? activeSession : null;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 sm:px-8 lg:py-8">
      <section className="rounded-lg border border-white/10 bg-[#0b1020]/90 p-6 shadow-2xl shadow-black/25">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#a78bfa]">
          Shows
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-normal text-white sm:text-4xl">
          Show workspace
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-[#b6c3d1]">
          Shows are loaded from the existing Supabase `public.shows` table. Show
          Type controls which Director Console workflow is exposed: scripted
          shows rely on imported script data for position and effect resolution,
          while manual shows allow field references to be entered directly.
        </p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="grid gap-6">
          <div
            className={`rounded-lg border p-6 shadow-xl shadow-black/20 ${activeShowSurfaceClassName}`}
          >
            <p
              className={`text-sm font-semibold uppercase tracking-[0.16em] ${activeShowSecondaryTextClassName}`}
            >
              Active Show Information
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-white">
              {activeShow?.name ?? "No active show selected"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#b6c3d1]">
              {activeShow
                ? `${activeShow.show_mode} workflow selected locally for this browser session.`
                : "Select a show to unlock the Director Console workflow for that show type."}
            </p>
            {activeShow ? (
              <button
                className="mt-5 rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-[#dbe4ef] transition-colors hover:border-[#8b5cf6] hover:text-white"
                onClick={handleClearActiveShow}
                type="button"
              >
                Clear Active Show
              </button>
            ) : null}
          </div>

          <form
            className="rounded-lg border border-white/10 bg-[#0b1020]/90 p-6 shadow-xl shadow-black/20"
            onSubmit={handleStartSession}
          >
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#a78bfa]">
              Continuity Sessions
            </p>
            <h2 className="mt-3 text-xl font-semibold text-white">
              Start Continuity Session
            </h2>
            {sessionForActiveShow ? (
              <div className="mt-4 rounded-lg border border-[#22c55e]/35 bg-[#082515] p-4">
                <p className="text-sm font-semibold text-[#bbf7d0]">
                  Active: {sessionForActiveShow.name}
                </p>
                <p className="mt-1 text-xs text-[#94a3b8]">
                  End this session from the Director Console.
                </p>
              </div>
            ) : (
              <div className="mt-4 grid gap-3">
                <label className="grid gap-2 text-sm font-semibold text-[#dbe4ef]">
                  Continuity Session Name
                  <input
                    className={fieldClassName}
                    onChange={(event) => setSessionName(event.target.value)}
                    placeholder="Morning Continuity Check"
                    value={sessionName}
                  />
                </label>
                <button
                  className="rounded-lg bg-[#6d28d9] px-4 py-3 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60"
                  disabled={isStartingSession || !activeShow}
                  type="submit"
                >
                  {isStartingSession
                    ? "Starting..."
                    : "Start Continuity Session"}
                </button>
              </div>
            )}
            {sessionMessage ? (
              <p className="mt-3 text-xs font-semibold leading-5 text-[#fde68a]">
                {sessionMessage}
              </p>
            ) : null}
          </form>

          <div className="rounded-lg border border-white/10 bg-[#0b1020]/90 p-6 shadow-xl shadow-black/20">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">
                  Supabase show list
                </p>
                <h2 className="mt-3 text-2xl font-semibold text-white">
                  Show selection
                </h2>
              </div>
              <button
                className="rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-[#dbe4ef] transition-colors hover:border-[#8b5cf6] hover:text-white"
                onClick={() => void loadShows()}
                type="button"
              >
                Refresh
              </button>
            </div>

            <div className="mt-6 grid gap-3">
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

                  return (
                    <article
                      className={`rounded-lg border p-4 ${
                        isActive
                          ? "border-[#8b5cf6] bg-[#17102c]"
                          : "border-white/10 bg-[#070b18]"
                      }`}
                      key={show.id}
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="text-lg font-semibold text-white">
                            {show.name}
                          </h3>
                          <p className="mt-2 text-sm text-[#94a3b8]">
                            {show.show_mode} | {formatShowDate(show.show_date)}
                            {show.location ? ` | ${show.location}` : ""}
                          </p>
                          <p className="mt-2 text-sm text-[#cbd5e1]">
                            Firing System:{" "}
                            <strong className="text-white">
                              {show.firing_system
                                ? firingSystemLabels[show.firing_system]
                                : "Not selected"}
                            </strong>
                          </p>
                          <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[#64748b]">
                            Status: {show.status ?? "not set"}
                          </p>
                        </div>
                        <button
                          className="rounded-lg bg-[#6d28d9] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-[#4c00a4]/20 transition-colors hover:bg-[#7c3aed]"
                          onClick={() => handleSetActiveShow(show)}
                          type="button"
                        >
                          {isActive ? "Active" : "Set Active Show"}
                        </button>
                      </div>
                      <div className="mt-4 grid gap-3 border-t border-white/10 pt-4">
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
                            <div className="flex flex-col gap-1">
                              <p className="text-sm font-semibold text-white">
                                Script Upload
                              </p>
                              <p className="text-xs leading-5 text-[#94a3b8]">
                                Metadata is stored in Supabase. File parsing and
                                content storage are not implemented yet.
                              </p>
                            </div>
                            <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
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
                            </dl>
                            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                              <label className="grid min-w-0 flex-1 gap-2 text-xs font-semibold text-[#cbd5e1]">
                                Select Script File
                                <input
                                  accept=".csv,text/csv"
                                  className="block w-full text-sm text-[#cbd5e1] file:mr-3 file:rounded-md file:border-0 file:bg-[#4c00a4] file:px-3 file:py-2 file:font-semibold file:text-white"
                                  onChange={(event) =>
                                    setScriptFiles((currentFiles) => ({
                                      ...currentFiles,
                                      [show.id]:
                                        event.target.files?.[0] ?? null,
                                    }))
                                  }
                                  type="file"
                                />
                              </label>
                              <button
                                className="rounded-md bg-[#6d28d9] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={
                                  updatingShowId === show.id ||
                                  !scriptFiles[show.id]
                                }
                                onClick={() =>
                                  void handleSaveScriptMetadata(show)
                                }
                                type="button"
                              >
                                Save Script Metadata
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </div>
        </div>

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
                <input
                  className={fieldClassName}
                  onChange={(event) => setShowDate(event.target.value)}
                  type="date"
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
                  Select a script to store its filename, upload timestamp, and
                  COBRA adapter key with the new show. CSV parsing is deferred.
                </p>
                <input
                  accept=".csv,text/csv"
                  className="mt-4 block w-full text-sm text-[#cbd5e1] file:mr-3 file:rounded-md file:border-0 file:bg-[#4c00a4] file:px-3 file:py-2 file:font-semibold file:text-white"
                  onChange={(event) =>
                    setNewShowScriptFile(event.target.files?.[0] ?? null)
                  }
                  type="file"
                />
              </div>
            ) : null}
            {message ? (
              <p className="rounded-lg border border-white/10 bg-[#070b18] p-3 text-sm text-[#dbe4ef]">
                {message}
              </p>
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
      </section>
    </div>
  );
}
