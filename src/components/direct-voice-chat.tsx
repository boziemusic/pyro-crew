"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  IssueVoiceMemoButton as DirectVoiceChatButton,
  IssueVoiceMemoPanel as DirectVoiceChatPanel,
  type IssueVoiceMemo as DirectVoiceMemo,
} from "./issue-voice-memos";
import { playVoiceMemoMessage } from "@/lib/app-feedback";
import { createSupabaseBrowserClient } from "@/lib/supabase";

export {
  DirectVoiceChatButton,
  DirectVoiceChatPanel,
  type DirectVoiceMemo,
};

type ReaderRole = "director" | "technician";

type DirectVoiceRead = {
  id: string;
  last_read_at: string;
  technician_name: string;
};

const BUCKET = "direct-voice-chat";
const CLOSED_POLL_INTERVAL_MS = 5000;
const OPEN_POLL_INTERVAL_MS = 2500;
const MAX_RECORDING_MS = 20000;
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export async function purgeDirectVoiceChat(
  supabase: SupabaseClient,
  sessionId: string,
) {
  const metadataResult = await supabase
    .from("direct_voice_memos")
    .select("storage_path")
    .eq("session_id", sessionId);

  if (metadataResult.error) {
    return { error: metadataResult.error };
  }

  const paths = (metadataResult.data ?? [])
    .map((memo) => memo.storage_path as string)
    .filter(Boolean);

  for (let index = 0; index < paths.length; index += 1000) {
    const result = await supabase.storage
      .from(BUCKET)
      .remove(paths.slice(index, index + 1000));
    if (result.error) {
      return { error: result.error };
    }
  }

  const readsResult = await supabase
    .from("direct_voice_memo_reads")
    .delete()
    .eq("session_id", sessionId);
  if (readsResult.error) {
    return { error: readsResult.error };
  }

  const memosResult = await supabase
    .from("direct_voice_memos")
    .delete()
    .eq("session_id", sessionId);
  return { error: memosResult.error };
}

function isOwnMemo(
  memo: DirectVoiceMemo,
  readerRole: ReaderRole,
  readerTechnicianName: string | null,
) {
  return readerRole === "director"
    ? memo.sender_role === "director"
    : memo.sender_role === "technician" &&
        memo.sender_technician_name === readerTechnicianName;
}

function fileExtension(mimeType: string) {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("webm")) return "webm";
  return "audio";
}

function sanitizePathSegment(value: string) {
  return encodeURIComponent(value.trim().toLocaleLowerCase());
}

export function useDirectVoiceChat({
  readerRole,
  readerTechnicianName,
  sessionId,
  showId,
  technicianNames,
}: {
  readerRole: ReaderRole;
  readerTechnicianName: string | null;
  sessionId: string | null | undefined;
  showId: string | undefined;
  technicianNames: string[];
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [memos, setMemos] = useState<DirectVoiceMemo[]>([]);
  const [readsByTechnician, setReadsByTechnician] = useState<
    Record<string, DirectVoiceRead>
  >({});
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [openTechnicianName, setOpenTechnicianName] = useState<
    string | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [newClosedMemo, setNewClosedMemo] =
    useState<DirectVoiceMemo | null>(null);
  const knownMemoIdsRef = useRef<Set<string> | null>(null);
  const markingReadRef = useRef<Set<string>>(new Set());
  const technicianNamesKey = useMemo(
    () => [...new Set(technicianNames)].sort().join(","),
    [technicianNames],
  );
  const stableTechnicianNames = useMemo(
    () =>
      technicianNamesKey
        ? technicianNamesKey.split(",")
        : [],
    [technicianNamesKey],
  );

  const markRead = useCallback(
    async (technicianName: string, lastReadAt: string) => {
      if (
        !showId ||
        !sessionId ||
        markingReadRef.current.has(technicianName)
      ) {
        return;
      }

      markingReadRef.current.add(technicianName);
      let query = supabase
        .from("direct_voice_memo_reads")
        .select("id")
        .eq("show_id", showId)
        .eq("session_id", sessionId)
        .eq("technician_name", technicianName)
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
          `Could not update Voice Chat read state: ${readError.message}`,
        );
        markingReadRef.current.delete(technicianName);
        return;
      }

      const now = new Date().toISOString();
      const result = existing
        ? await supabase
            .from("direct_voice_memo_reads")
            .update({ last_read_at: lastReadAt, updated_at: now })
            .eq("id", existing.id)
        : await supabase.from("direct_voice_memo_reads").insert({
            last_read_at: lastReadAt,
            reader_role: readerRole,
            reader_technician_name:
              readerRole === "technician"
                ? readerTechnicianName
                : null,
            session_id: sessionId,
            show_id: showId,
            technician_name: technicianName,
            updated_at: now,
          });

      if (result.error) {
        setError(
          `Could not update Voice Chat read state: ${result.error.message}`,
        );
      } else {
        setReadsByTechnician((current) => ({
          ...current,
          [technicianName]: {
            id: existing?.id ?? current[technicianName]?.id ?? "",
            last_read_at: lastReadAt,
            technician_name: technicianName,
          },
        }));
      }
      markingReadRef.current.delete(technicianName);
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
    readerRole,
    readerTechnicianName,
    sessionId,
    showId,
    technicianNamesKey,
  ]);

  const refresh = useCallback(async () => {
    if (
      !showId ||
      !sessionId ||
      stableTechnicianNames.length === 0
    ) {
      setMemos([]);
      setReadsByTechnician({});
      setSignedUrls({});
      knownMemoIdsRef.current = new Set();
      setError(null);
      return;
    }

    const memosResult = await supabase
      .from("direct_voice_memos")
      .select(
        "id, show_id, session_id, technician_name, sender_role, sender_technician_name, storage_path, mime_type, duration_ms, file_size_bytes, client_memo_id, created_at",
      )
      .eq("show_id", showId)
      .eq("session_id", sessionId)
      .in("technician_name", stableTechnicianNames)
      .order("created_at", { ascending: true });

    let readsQuery = supabase
      .from("direct_voice_memo_reads")
      .select("id, technician_name, last_read_at")
      .eq("show_id", showId)
      .eq("session_id", sessionId)
      .eq("reader_role", readerRole)
      .in("technician_name", stableTechnicianNames);
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
      setError(`Could not load Voice Chat: ${queryError.message}`);
      return;
    }

    const nextMemos = (memosResult.data ?? []) as DirectVoiceMemo[];
    const previousIds = knownMemoIdsRef.current;
    if (previousIds) {
      const newMemos = nextMemos.filter(
        (memo) =>
          !previousIds.has(memo.id) &&
          memo.technician_name !== openTechnicianName &&
          !isOwnMemo(memo, readerRole, readerTechnicianName),
      );
      if (newMemos.length > 0) {
        setNewClosedMemo(newMemos.at(-1) ?? null);
        playVoiceMemoMessage();
      }
    }

    knownMemoIdsRef.current = new Set(
      nextMemos.map((memo) => memo.id),
    );
    const nextReads = Object.fromEntries(
      ((readsResult.data ?? []) as DirectVoiceRead[]).map((read) => [
        read.technician_name,
        read,
      ]),
    );
    setMemos(nextMemos);
    setReadsByTechnician(nextReads);
    setError(null);

    if (openTechnicianName) {
      const latestMemo = nextMemos
        .filter(
          (memo) =>
            memo.technician_name === openTechnicianName,
        )
        .at(-1);
      const currentReadAt =
        nextReads[openTechnicianName]?.last_read_at;
      if (
        latestMemo &&
        (!currentReadAt ||
          Date.parse(latestMemo.created_at) >
            Date.parse(currentReadAt))
      ) {
        void markRead(openTechnicianName, latestMemo.created_at);
      }
    }
  }, [
    markRead,
    openTechnicianName,
    readerRole,
    readerTechnicianName,
    sessionId,
    showId,
    stableTechnicianNames,
    supabase,
  ]);

  useEffect(() => {
    const initialId = window.setTimeout(() => void refresh(), 0);
    const intervalId = window.setInterval(
      () => void refresh(),
      openTechnicianName
        ? OPEN_POLL_INTERVAL_MS
        : CLOSED_POLL_INTERVAL_MS,
    );
    return () => {
      window.clearTimeout(initialId);
      window.clearInterval(intervalId);
    };
  }, [openTechnicianName, refresh]);

  const memosByTechnician = useMemo(() => {
    const grouped: Record<string, DirectVoiceMemo[]> = {};
    memos.forEach((memo) => {
      if (!memo.technician_name) return;
      grouped[memo.technician_name] = [
        ...(grouped[memo.technician_name] ?? []),
        memo,
      ];
    });
    return grouped;
  }, [memos]);

  const openMemos = useMemo(
    () =>
      openTechnicianName
        ? (memosByTechnician[openTechnicianName] ?? [])
        : [],
    [memosByTechnician, openTechnicianName],
  );
  const openMemosKey = openMemos
    .map((memo) => `${memo.id}:${memo.storage_path}`)
    .join(",");

  useEffect(() => {
    if (!openTechnicianName || openMemos.length === 0) return;
    let cancelled = false;
    const loadUrls = async () => {
      const missing = openMemos.filter((memo) => !signedUrls[memo.id]);
      if (missing.length === 0) return;
      const results = await Promise.all(
        missing.map(async (memo) => ({
          id: memo.id,
          result: await supabase.storage
            .from(BUCKET)
            .createSignedUrl(
              memo.storage_path,
              SIGNED_URL_TTL_SECONDS,
            ),
        })),
      );
      if (cancelled) return;
      const failed = results.find(({ result }) => result.error);
      if (failed?.result.error) {
        setError(
          `Could not load Voice Chat audio: ${failed.result.error.message}`,
        );
        return;
      }
      setSignedUrls((current) => ({
        ...current,
        ...Object.fromEntries(
          results.map(({ id, result }) => [
            id,
            result.data?.signedUrl ?? "",
          ]),
        ),
      }));
    };
    void loadUrls();
    return () => {
      cancelled = true;
    };
  }, [
    openMemos,
    openMemosKey,
    openTechnicianName,
    signedUrls,
    supabase,
  ]);

  const unreadByTechnician = useMemo(() => {
    const counts: Record<string, number> = {};
    stableTechnicianNames.forEach((technicianName) => {
      const lastReadAt =
        readsByTechnician[technicianName]?.last_read_at;
      counts[technicianName] = (
        memosByTechnician[technicianName] ?? []
      ).filter(
        (memo) =>
          !isOwnMemo(memo, readerRole, readerTechnicianName) &&
          (!lastReadAt ||
            Date.parse(memo.created_at) > Date.parse(lastReadAt)),
      ).length;
    });
    return counts;
  }, [
    memosByTechnician,
    readerRole,
    readerTechnicianName,
    readsByTechnician,
    stableTechnicianNames,
  ]);

  const latestUnreadByTechnician = useMemo(() => {
    const latest: Record<string, DirectVoiceMemo> = {};
    stableTechnicianNames.forEach((technicianName) => {
      const lastReadAt =
        readsByTechnician[technicianName]?.last_read_at;
      const memo = (memosByTechnician[technicianName] ?? [])
        .filter(
          (candidate) =>
            !isOwnMemo(
              candidate,
              readerRole,
              readerTechnicianName,
            ) &&
            (!lastReadAt ||
              Date.parse(candidate.created_at) >
                Date.parse(lastReadAt)),
        )
        .at(-1);
      if (memo) latest[technicianName] = memo;
    });
    return latest;
  }, [
    memosByTechnician,
    readerRole,
    readerTechnicianName,
    readsByTechnician,
    stableTechnicianNames,
  ]);

  const openPanel = useCallback(
    (technicianName: string) => {
      setOpenTechnicianName(technicianName);
      setNewClosedMemo((current) =>
        current?.technician_name === technicianName
          ? null
          : current,
      );
      const latestMemo = (
        memosByTechnician[technicianName] ?? []
      ).at(-1);
      if (latestMemo) {
        void markRead(technicianName, latestMemo.created_at);
      }
    },
    [markRead, memosByTechnician],
  );

  const uploadMemo = useCallback(
    async (
      technicianName: string,
      blob: Blob,
      durationMs: number,
      mimeType: string,
    ) => {
      if (!showId || !sessionId) return false;
      if (blob.size > MAX_FILE_SIZE_BYTES) {
        setError("Voice Chat recording exceeds the 2 MB limit.");
        return false;
      }

      setIsUploading(true);
      setError(null);
      const memoId = window.crypto.randomUUID();
      const normalizedMimeType = mimeType || blob.type || "audio/webm";
      const storagePath = `${showId}/${sessionId}/${sanitizePathSegment(technicianName)}/${memoId}.${fileExtension(normalizedMimeType)}`;
      const uploadResult = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, blob, {
          cacheControl: "3600",
          contentType: normalizedMimeType,
          upsert: false,
        });
      if (uploadResult.error) {
        setError(
          `Could not upload Voice Chat: ${uploadResult.error.message}`,
        );
        setIsUploading(false);
        return false;
      }

      const metadataResult = await supabase
        .from("direct_voice_memos")
        .insert({
          client_memo_id: memoId,
          duration_ms: Math.min(
            MAX_RECORDING_MS,
            Math.max(1, Math.round(durationMs)),
          ),
          file_size_bytes: blob.size,
          mime_type: normalizedMimeType,
          sender_role: readerRole,
          sender_technician_name:
            readerRole === "technician"
              ? readerTechnicianName
              : null,
          session_id: sessionId,
          show_id: showId,
          storage_path: storagePath,
          technician_name: technicianName,
        });
      if (metadataResult.error) {
        await supabase.storage.from(BUCKET).remove([storagePath]);
        setError(
          `Voice Chat uploaded, but metadata failed: ${metadataResult.error.message}`,
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
    clearNewClosedMemo: () => setNewClosedMemo(null),
    closePanel: () => setOpenTechnicianName(null),
    error,
    isUploading,
    latestUnreadByTechnician,
    memosByTechnician,
    newClosedMemo,
    openPanel,
    openTechnicianName,
    refresh,
    signedUrls,
    unreadByTechnician,
    uploadMemo,
  };
}
