"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTemporaryTechnicianLabel } from "./temporary-technician-store";
import { playVoiceMemoMessage } from "@/lib/app-feedback";
import { createSupabaseBrowserClient } from "@/lib/supabase";

const VOICE_MEMO_BUCKET = "issue-voice-memos";
const CLOSED_POLL_INTERVAL_MS = 5000;
const OPEN_POLL_INTERVAL_MS = 2500;
const MAX_RECORDING_MS = 20000;
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 60 * 60;

type ReaderRole = "director" | "technician";

export type IssueVoiceMemo = {
  client_memo_id: string | null;
  created_at: string;
  duration_ms: number;
  file_size_bytes: number;
  id: string;
  issue_id: string;
  mime_type: string;
  sender_role: string;
  sender_technician_name: string | null;
  session_id: string;
  show_id: string;
  storage_path: string;
};

type IssueVoiceMemoRead = {
  id: string;
  issue_id: string;
  last_read_at: string;
};

export type IssueVoiceMemoTarget = {
  channelNumber: number;
  cueValue: string;
  id: string;
  positionName: string | null;
};

type PurgeScope =
  | { issueId: string; sessionId?: never }
  | { issueId?: never; sessionId: string };

export async function purgeIssueVoiceMemos(
  supabase: SupabaseClient,
  scope: PurgeScope,
) {
  const column = scope.issueId ? "issue_id" : "session_id";
  const value = scope.issueId ?? scope.sessionId;
  const memoResult = await supabase
    .from("issue_voice_memos")
    .select("storage_path")
    .eq(column, value);

  if (memoResult.error) {
    return { error: memoResult.error };
  }

  const paths = (memoResult.data ?? [])
    .map((memo) => memo.storage_path as string)
    .filter(Boolean);

  for (let index = 0; index < paths.length; index += 1000) {
    const removeResult = await supabase.storage
      .from(VOICE_MEMO_BUCKET)
      .remove(paths.slice(index, index + 1000));

    if (removeResult.error) {
      return { error: removeResult.error };
    }
  }

  const readsResult = await supabase
    .from("issue_voice_memo_reads")
    .delete()
    .eq(column, value);

  if (readsResult.error) {
    return { error: readsResult.error };
  }

  const metadataResult = await supabase
    .from("issue_voice_memos")
    .delete()
    .eq(column, value);

  return { error: metadataResult.error };
}

function isOwnMemo(
  memo: IssueVoiceMemo,
  readerRole: ReaderRole,
  readerTechnicianName: string | null,
) {
  if (readerRole === "director") {
    return memo.sender_role === "director";
  }

  return (
    memo.sender_role === "technician" &&
    memo.sender_technician_name === readerTechnicianName
  );
}

function getFileExtension(mimeType: string) {
  if (mimeType.includes("mp4")) {
    return "m4a";
  }
  if (mimeType.includes("ogg")) {
    return "ogg";
  }
  if (mimeType.includes("webm")) {
    return "webm";
  }
  return "audio";
}

function formatMemoTime(createdAt: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(createdAt));
}

function formatDuration(durationMs: number) {
  return `${Math.max(1, Math.ceil(durationMs / 1000))}s`;
}

function getSupportedRecordingMimeType() {
  if (
    typeof window === "undefined" ||
    typeof window.MediaRecorder === "undefined"
  ) {
    return "";
  }

  const candidates = [
    "audio/webm;codecs=opus",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
    "audio/webm",
  ];

  return (
    candidates.find((candidate) =>
      MediaRecorder.isTypeSupported(candidate),
    ) ?? ""
  );
}

export function useIssueVoiceMemos({
  issueIds,
  readerRole,
  readerTechnicianName,
  sessionId,
  showId,
}: {
  issueIds: string[];
  readerRole: ReaderRole;
  readerTechnicianName: string | null;
  sessionId: string | null | undefined;
  showId: string | undefined;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [memos, setMemos] = useState<IssueVoiceMemo[]>([]);
  const [readsByIssue, setReadsByIssue] = useState<
    Record<string, IssueVoiceMemoRead>
  >({});
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [openIssueId, setOpenIssueId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const knownMemoIdsRef = useRef<Set<string> | null>(null);
  const markingReadIssueIdsRef = useRef<Set<string>>(new Set());
  const issueIdsKey = useMemo(
    () => [...new Set(issueIds)].sort().join(","),
    [issueIds],
  );
  const stableIssueIds = useMemo(
    () => (issueIdsKey ? issueIdsKey.split(",") : []),
    [issueIdsKey],
  );

  const markRead = useCallback(
    async (issueId: string, lastReadAt: string) => {
      if (
        !showId ||
        !sessionId ||
        markingReadIssueIdsRef.current.has(issueId)
      ) {
        return;
      }

      markingReadIssueIdsRef.current.add(issueId);
      let query = supabase
        .from("issue_voice_memo_reads")
        .select("id")
        .eq("issue_id", issueId)
        .eq("reader_role", readerRole);

      query =
        readerRole === "director"
          ? query.is("reader_technician_name", null)
          : query.eq(
              "reader_technician_name",
              readerTechnicianName ?? "",
            );

      const { data: existing, error: readError } =
        await query.maybeSingle();

      if (readError) {
        setError(
          `Could not update voice memo read state: ${readError.message}`,
        );
        markingReadIssueIdsRef.current.delete(issueId);
        return;
      }

      const now = new Date().toISOString();
      const result = existing
        ? await supabase
            .from("issue_voice_memo_reads")
            .update({
              last_read_at: lastReadAt,
              updated_at: now,
            })
            .eq("id", existing.id)
        : await supabase.from("issue_voice_memo_reads").insert({
            issue_id: issueId,
            last_read_at: lastReadAt,
            reader_role: readerRole,
            reader_technician_name:
              readerRole === "technician"
                ? readerTechnicianName
                : null,
            session_id: sessionId,
            show_id: showId,
            updated_at: now,
          });

      if (result.error) {
        setError(
          `Could not update voice memo read state: ${result.error.message}`,
        );
        markingReadIssueIdsRef.current.delete(issueId);
        return;
      }

      setReadsByIssue((current) => ({
        ...current,
        [issueId]: {
          id: existing?.id ?? current[issueId]?.id ?? "",
          issue_id: issueId,
          last_read_at: lastReadAt,
        },
      }));
      markingReadIssueIdsRef.current.delete(issueId);
    },
    [
      readerRole,
      readerTechnicianName,
      sessionId,
      showId,
      supabase,
    ],
  );

  useEffect(() => {
    knownMemoIdsRef.current = null;
  }, [
    issueIdsKey,
    readerRole,
    readerTechnicianName,
    sessionId,
    showId,
  ]);

  const refresh = useCallback(async () => {
    if (!showId || !sessionId || stableIssueIds.length === 0) {
      setMemos([]);
      setReadsByIssue({});
      setSignedUrls({});
      knownMemoIdsRef.current = new Set();
      setError(null);
      return;
    }

    const memosResult = await supabase
      .from("issue_voice_memos")
      .select(
        "id, issue_id, show_id, session_id, sender_role, sender_technician_name, storage_path, mime_type, duration_ms, file_size_bytes, client_memo_id, created_at",
      )
      .eq("show_id", showId)
      .eq("session_id", sessionId)
      .in("issue_id", stableIssueIds)
      .order("created_at", { ascending: true });

    let readsQuery = supabase
      .from("issue_voice_memo_reads")
      .select("id, issue_id, last_read_at")
      .eq("show_id", showId)
      .eq("session_id", sessionId)
      .eq("reader_role", readerRole)
      .in("issue_id", stableIssueIds);

    readsQuery =
      readerRole === "director"
        ? readsQuery.is("reader_technician_name", null)
        : readsQuery.eq(
            "reader_technician_name",
            readerTechnicianName ?? "",
          );

    const readsResult = await readsQuery;
    const queryError = memosResult.error ?? readsResult.error;

    if (queryError) {
      setError(`Could not load voice memos: ${queryError.message}`);
      return;
    }

    const nextMemos = (memosResult.data ?? []) as IssueVoiceMemo[];
    const previousIds = knownMemoIdsRef.current;

    if (previousIds) {
      const hasClosedPanelMemo = nextMemos.some(
        (memo) =>
          !previousIds.has(memo.id) &&
          memo.issue_id !== openIssueId &&
          !isOwnMemo(memo, readerRole, readerTechnicianName),
      );

      if (hasClosedPanelMemo) {
        playVoiceMemoMessage();
      }
    }

    knownMemoIdsRef.current = new Set(nextMemos.map((memo) => memo.id));
    const nextReads = Object.fromEntries(
      ((readsResult.data ?? []) as IssueVoiceMemoRead[]).map((read) => [
        read.issue_id,
        read,
      ]),
    );

    setMemos(nextMemos);
    setReadsByIssue(nextReads);
    setError(null);

    if (openIssueId) {
      const latestMemo = nextMemos
        .filter((memo) => memo.issue_id === openIssueId)
        .at(-1);
      const currentReadAt = nextReads[openIssueId]?.last_read_at;

      if (
        latestMemo &&
        (!currentReadAt ||
          Date.parse(latestMemo.created_at) >
            Date.parse(currentReadAt))
      ) {
        void markRead(openIssueId, latestMemo.created_at);
      }
    }
  }, [
    markRead,
    openIssueId,
    readerRole,
    readerTechnicianName,
    sessionId,
    showId,
    stableIssueIds,
    supabase,
  ]);

  useEffect(() => {
    const initialId = window.setTimeout(() => void refresh(), 0);
    const intervalId = window.setInterval(
      () => void refresh(),
      openIssueId ? OPEN_POLL_INTERVAL_MS : CLOSED_POLL_INTERVAL_MS,
    );

    return () => {
      window.clearTimeout(initialId);
      window.clearInterval(intervalId);
    };
  }, [openIssueId, refresh]);

  const memosByIssue = useMemo(() => {
    const grouped: Record<string, IssueVoiceMemo[]> = {};

    memos.forEach((memo) => {
      grouped[memo.issue_id] = [
        ...(grouped[memo.issue_id] ?? []),
        memo,
      ];
    });

    return grouped;
  }, [memos]);

  const openIssueMemos = useMemo(
    () => (openIssueId ? (memosByIssue[openIssueId] ?? []) : []),
    [memosByIssue, openIssueId],
  );
  const openIssueMemoKey = openIssueMemos
    .map((memo) => `${memo.id}:${memo.storage_path}`)
    .join(",");

  useEffect(() => {
    if (!openIssueId || openIssueMemos.length === 0) {
      return;
    }

    let isCancelled = false;
    const loadSignedUrls = async () => {
      const missingMemos = openIssueMemos.filter(
        (memo) => !signedUrls[memo.id],
      );

      if (missingMemos.length === 0) {
        return;
      }

      const results = await Promise.all(
        missingMemos.map(async (memo) => ({
          memo,
          result: await supabase.storage
            .from(VOICE_MEMO_BUCKET)
            .createSignedUrl(
              memo.storage_path,
              SIGNED_URL_TTL_SECONDS,
            ),
        })),
      );

      if (isCancelled) {
        return;
      }

      const failedResult = results.find(({ result }) => result.error);
      if (failedResult?.result.error) {
        setError(
          `Could not load voice memo audio: ${failedResult.result.error.message}`,
        );
        return;
      }

      setSignedUrls((current) => ({
        ...current,
        ...Object.fromEntries(
          results.map(({ memo, result }) => [
            memo.id,
            result.data?.signedUrl ?? "",
          ]),
        ),
      }));
    };

    void loadSignedUrls();
    return () => {
      isCancelled = true;
    };
  }, [
    openIssueId,
    openIssueMemoKey,
    openIssueMemos,
    signedUrls,
    supabase,
  ]);

  const unreadByIssue = useMemo(() => {
    const counts: Record<string, number> = {};

    stableIssueIds.forEach((issueId) => {
      const lastReadAt = readsByIssue[issueId]?.last_read_at;
      counts[issueId] = (memosByIssue[issueId] ?? []).filter(
        (memo) =>
          !isOwnMemo(memo, readerRole, readerTechnicianName) &&
          (!lastReadAt ||
            Date.parse(memo.created_at) > Date.parse(lastReadAt)),
      ).length;
    });

    return counts;
  }, [
    memosByIssue,
    readerRole,
    readerTechnicianName,
    readsByIssue,
    stableIssueIds,
  ]);

  const openPanel = useCallback(
    (issueId: string) => {
      setOpenIssueId(issueId);
      const latestMemo = (memosByIssue[issueId] ?? []).at(-1);

      if (latestMemo) {
        void markRead(issueId, latestMemo.created_at);
      }
    },
    [markRead, memosByIssue],
  );

  const closePanel = useCallback(() => setOpenIssueId(null), []);

  const uploadMemo = useCallback(
    async (
      issueId: string,
      blob: Blob,
      durationMs: number,
      mimeType: string,
    ) => {
      if (!showId || !sessionId) {
        return false;
      }

      if (blob.size > MAX_FILE_SIZE_BYTES) {
        setError("Voice memo exceeds the 2 MB upload limit.");
        return false;
      }

      setIsUploading(true);
      setError(null);
      const memoId = window.crypto.randomUUID();
      const normalizedMimeType =
        mimeType || blob.type || "audio/webm";
      const storagePath = `${showId}/${sessionId}/${issueId}/${memoId}.${getFileExtension(normalizedMimeType)}`;
      const uploadResult = await supabase.storage
        .from(VOICE_MEMO_BUCKET)
        .upload(storagePath, blob, {
          cacheControl: "3600",
          contentType: normalizedMimeType,
          upsert: false,
        });

      if (uploadResult.error) {
        setError(
          `Could not upload voice memo: ${uploadResult.error.message}`,
        );
        setIsUploading(false);
        return false;
      }

      const metadataResult = await supabase
        .from("issue_voice_memos")
        .insert({
          client_memo_id: memoId,
          duration_ms: Math.min(
            MAX_RECORDING_MS,
            Math.max(1, Math.round(durationMs)),
          ),
          file_size_bytes: blob.size,
          issue_id: issueId,
          mime_type: normalizedMimeType,
          sender_role: readerRole,
          sender_technician_name:
            readerRole === "technician"
              ? readerTechnicianName
              : null,
          session_id: sessionId,
          show_id: showId,
          storage_path: storagePath,
        });

      if (metadataResult.error) {
        await supabase.storage
          .from(VOICE_MEMO_BUCKET)
          .remove([storagePath]);
        setError(
          `Voice memo uploaded, but metadata could not be saved: ${metadataResult.error.message}`,
        );
        setIsUploading(false);
        return false;
      }

      await refresh();
      setIsUploading(false);
      return true;
    },
    [
      readerRole,
      readerTechnicianName,
      refresh,
      sessionId,
      showId,
      supabase,
    ],
  );

  return {
    closePanel,
    error,
    isUploading,
    memosByIssue,
    openIssueId,
    openPanel,
    refresh,
    signedUrls,
    unreadByIssue,
    uploadMemo,
  };
}

export function IssueVoiceMemoButton({
  compact = false,
  onClick,
  unreadCount,
}: {
  compact?: boolean;
  onClick: () => void;
  unreadCount: number;
}) {
  return (
    <button
      aria-label={
        unreadCount > 0
          ? `Open voice memos, ${unreadCount} unread`
          : "Open voice memos"
      }
      className={`relative inline-flex items-center justify-center rounded-md border border-[#f59e0b]/40 bg-[#2a1c06] text-[#fde68a] transition hover:border-[#fbbf24] hover:text-white ${
        compact
          ? "min-h-7 min-w-7 px-1 text-xs"
          : "min-h-9 min-w-9 px-2 text-sm"
      }`}
      onClick={onClick}
      title="Issue voice memos"
      type="button"
    >
      <span aria-hidden="true">🎙️</span>
      {unreadCount > 0 ? (
        <span className="absolute -right-2 -top-2 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#ef4444] px-1 text-[10px] font-bold text-white shadow-lg">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
    </button>
  );
}

export function IssueVoiceMemoPanel({
  error,
  isUploading,
  memos,
  onClose,
  onUpload,
  readerRole,
  readerTechnicianName,
  signedUrls,
  target,
}: {
  error: string | null;
  isUploading: boolean;
  memos: IssueVoiceMemo[];
  onClose: () => void;
  onUpload: (
    blob: Blob,
    durationMs: number,
    mimeType: string,
  ) => Promise<boolean>;
  readerRole: ReaderRole;
  readerTechnicianName: string | null;
  signedUrls: Record<string, string>;
  target: IssueVoiceMemoTarget;
}) {
  const [recordingState, setRecordingState] = useState<
    "idle" | "requesting" | "recording"
  >("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [recordingError, setRecordingError] = useState<string | null>(
    null,
  );
  const [pendingRecording, setPendingRecording] = useState<{
    blob: Blob;
    durationMs: number;
    mimeType: string;
    previewUrl: string;
  } | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef(0);
  const stopTimeoutRef = useRef<number | null>(null);
  const elapsedIntervalRef = useRef<number | null>(null);

  const clearRecordingTimers = useCallback(() => {
    if (stopTimeoutRef.current !== null) {
      window.clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
    if (elapsedIntervalRef.current !== null) {
      window.clearInterval(elapsedIntervalRef.current);
      elapsedIntervalRef.current = null;
    }
  }, []);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(
    () => () => {
      clearRecordingTimers();
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
      releaseStream();
    },
    [clearRecordingTimers, releaseStream],
  );

  useEffect(
    () => () => {
      if (pendingRecording?.previewUrl) {
        URL.revokeObjectURL(pendingRecording.previewUrl);
      }
    },
    [pendingRecording],
  );

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }, []);

  const startRecording = async () => {
    setRecordingError(null);

    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof window.MediaRecorder === "undefined"
    ) {
      setRecordingError(
        "Voice recording is not supported by this browser.",
      );
      return;
    }

    setRecordingState("requesting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const mimeType = getSupportedRecordingMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, {
            audioBitsPerSecond: 64000,
            mimeType,
          })
        : new MediaRecorder(stream, {
            audioBitsPerSecond: 64000,
          });

      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      recordingStartedAtRef.current = performance.now();
      setElapsedMs(0);

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      });
      recorder.addEventListener("error", () => {
        clearRecordingTimers();
        releaseStream();
        setRecordingState("idle");
        setRecordingError("Recording stopped because of a microphone error.");
      });
      recorder.addEventListener("stop", () => {
        clearRecordingTimers();
        const durationMs = Math.min(
          MAX_RECORDING_MS,
          performance.now() - recordingStartedAtRef.current,
        );
        const actualMimeType =
          recorder.mimeType ||
          chunksRef.current[0]?.type ||
          mimeType ||
          "audio/webm";
        const blob = new Blob(chunksRef.current, {
          type: actualMimeType,
        });

        releaseStream();
        recorderRef.current = null;
        setRecordingState("idle");
        setElapsedMs(durationMs);

        if (blob.size === 0) {
          setRecordingError(
            "The recording was empty. Please try again.",
          );
          return;
        }

        setPendingRecording((current) => {
          if (current?.previewUrl) {
            URL.revokeObjectURL(current.previewUrl);
          }
          return {
            blob,
            durationMs,
            mimeType: actualMimeType,
            previewUrl: URL.createObjectURL(blob),
          };
        });
      });

      recorder.start(1000);
      setRecordingState("recording");
      elapsedIntervalRef.current = window.setInterval(() => {
        setElapsedMs(
          Math.min(
            MAX_RECORDING_MS,
            performance.now() - recordingStartedAtRef.current,
          ),
        );
      }, 100);
      stopTimeoutRef.current = window.setTimeout(
        stopRecording,
        MAX_RECORDING_MS,
      );
    } catch (recordError) {
      clearRecordingTimers();
      releaseStream();
      setRecordingState("idle");
      setRecordingError(
        recordError instanceof DOMException &&
          recordError.name === "NotAllowedError"
          ? "Microphone permission was denied."
          : "Could not start microphone recording.",
      );
    }
  };

  const discardPendingRecording = () => {
    if (pendingRecording?.previewUrl) {
      URL.revokeObjectURL(pendingRecording.previewUrl);
    }
    setPendingRecording(null);
    setElapsedMs(0);
    setRecordingError(null);
  };

  const sendPendingRecording = async () => {
    if (!pendingRecording) {
      return;
    }

    const wasUploaded = await onUpload(
      pendingRecording.blob,
      pendingRecording.durationMs,
      pendingRecording.mimeType,
    );

    if (wasUploaded) {
      discardPendingRecording();
    }
  };

  return (
    <div
      aria-labelledby="issue-voice-memos-title"
      aria-modal="true"
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/65 p-3 sm:items-center sm:p-5"
      role="dialog"
    >
      <section className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-[#f59e0b]/40 bg-[#0b1020] shadow-2xl shadow-black/70">
        <header className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#fbbf24]">
              Voice Memos
            </p>
            <h2
              className="mt-1 text-sm font-semibold text-white"
              id="issue-voice-memos-title"
            >
              CH {target.channelNumber} | Cue(s) {target.cueValue}
            </h2>
            <p className="mt-1 text-xs text-[#94a3b8]">
              Position: {target.positionName ?? "—"}
            </p>
          </div>
          <button
            aria-label="Close issue voice memos"
            className="rounded-md border border-white/15 px-3 py-2 text-sm font-semibold text-[#cbd5e1]"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </header>

        <div className="min-h-44 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {memos.length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/15 p-4 text-center text-sm text-[#94a3b8]">
              No voice memos yet.
            </p>
          ) : (
            memos.map((memo) => {
              const ownMemo = isOwnMemo(
                memo,
                readerRole,
                readerTechnicianName,
              );
              const senderLabel =
                memo.sender_role === "director"
                  ? "Director"
                  : getTemporaryTechnicianLabel(
                      memo.sender_technician_name ?? undefined,
                    );

              return (
                <div
                  className={`flex ${ownMemo ? "justify-end" : "justify-start"}`}
                  key={memo.id}
                >
                  <div
                    className={`w-[88%] rounded-lg border px-3 py-2 ${
                      ownMemo
                        ? "border-[#f59e0b]/40 bg-[#2a1c06]"
                        : "border-white/10 bg-[#111827]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-[0.1em]">
                      <span
                        className={
                          ownMemo
                            ? "text-[#fde68a]"
                            : "text-[#93c5fd]"
                        }
                      >
                        {senderLabel}
                      </span>
                      <span className="text-[#64748b]">
                        {formatDuration(memo.duration_ms)} ·{" "}
                        {formatMemoTime(memo.created_at)}
                      </span>
                    </div>
                    {signedUrls[memo.id] ? (
                      <audio
                        className="mt-2 h-10 w-full"
                        controls
                        preload="metadata"
                        src={signedUrls[memo.id]}
                      >
                        Your browser does not support audio playback.
                      </audio>
                    ) : (
                      <p className="mt-2 text-xs text-[#94a3b8]">
                        Loading audio…
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="border-t border-white/10 p-3">
          {pendingRecording ? (
            <div className="rounded-lg border border-[#f59e0b]/35 bg-[#2a1c06]/70 p-3">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#fde68a]">
                Review Recording ·{" "}
                {formatDuration(pendingRecording.durationMs)}
              </p>
              <audio
                className="mt-2 h-10 w-full"
                controls
                src={pendingRecording.previewUrl}
              />
              <div className="mt-3 flex gap-2">
                <button
                  className="flex-1 rounded-md bg-[#b45309] px-3 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isUploading}
                  onClick={() => void sendPendingRecording()}
                  type="button"
                >
                  {isUploading ? "Sending…" : "Send Voice Memo"}
                </button>
                <button
                  className="rounded-md border border-white/15 px-3 py-2 text-sm font-semibold text-[#cbd5e1] disabled:opacity-50"
                  disabled={isUploading}
                  onClick={discardPendingRecording}
                  type="button"
                >
                  Discard
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[#dbe4ef]">
                  {recordingState === "recording"
                    ? `Recording… ${formatDuration(elapsedMs)} / 20s`
                    : recordingState === "requesting"
                      ? "Requesting microphone…"
                      : "Record a memo up to 20 seconds"}
                </p>
                <p className="mt-1 text-[11px] text-[#64748b]">
                  Director, primary tech, and helpers
                </p>
              </div>
              {recordingState === "recording" ? (
                <button
                  className="min-h-11 rounded-md bg-[#b91c1c] px-4 py-2 text-sm font-bold text-white"
                  onClick={stopRecording}
                  type="button"
                >
                  Stop
                </button>
              ) : (
                <button
                  className="min-h-11 rounded-md bg-[#b45309] px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={recordingState === "requesting"}
                  onClick={() => void startRecording()}
                  type="button"
                >
                  🎙️ Record
                </button>
              )}
            </div>
          )}
          {recordingError || error ? (
            <p className="mt-2 text-xs font-semibold text-[#fecaca]">
              {recordingError ?? error}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
