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

type ShowMode = "scripted" | "manual";

type ShowRecord = {
  id: string;
  company_id: string | null;
  name: string;
  location: string | null;
  show_date: string | null;
  show_mode: ShowMode;
  status: string | null;
  created_by_user_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const fieldClassName =
  "rounded-lg border border-[#334155] bg-[#020617] px-3 py-3 text-base font-semibold text-white placeholder:text-[#94a3b8] focus:border-[#8b5cf6] focus:outline-none focus:ring-2 focus:ring-[#4c00a4]/60";

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
  const [name, setName] = useState("");
  const [showMode, setShowMode] = useState<ShowMode>("scripted");
  const [showDate, setShowDate] = useState("");
  const [location, setLocation] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(
    null,
  );

  const fetchShows = useCallback(async () => {
    return supabase
      .from("shows")
      .select(
        "id, company_id, name, location, show_date, show_mode, status, created_by_user_id, created_at, updated_at",
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
        location: location.trim() || null,
        name: trimmedName,
        show_date: showDate || null,
        show_mode: showMode,
      })
      .select(
        "id, company_id, name, location, show_date, show_mode, status, created_by_user_id, created_at, updated_at",
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
      setMessage(`Created show: ${createdShow.name}`);
    }

    setIsCreating(false);
  };

  const handleSetActiveShow = (show: ShowRecord) => {
    const nextActiveShow: ActiveShow = {
      id: show.id,
      name: show.name,
      show_mode: show.show_mode,
    };

    writeActiveShow(nextActiveShow);
  };

  const handleClearActiveShow = () => {
    writeActiveShow(null);
  };

  const activeShowSurfaceClassName = activeShow
    ? ACTIVE_SHOW_SUCCESS_SURFACE
    : ACTIVE_SHOW_NEUTRAL_SURFACE;
  const activeShowSecondaryTextClassName = activeShow
    ? ACTIVE_SHOW_SUCCESS_SECONDARY_TEXT
    : ACTIVE_SHOW_NEUTRAL_SECONDARY_TEXT;

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
            <div className="rounded-lg border border-dashed border-[#475569] bg-[#070b18] px-4 py-6">
              <p className="text-base font-semibold text-white">
                Script upload placeholder
              </p>
              <p className="mt-2 text-sm leading-6 text-[#94a3b8]">
                Script upload is not implemented yet. Manual shows can proceed
                without a script upload.
              </p>
            </div>
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
