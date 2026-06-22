"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTemporaryTechnicianLabel } from "./temporary-technician-store";
import { playChatMessage } from "@/lib/app-feedback";
import { createSupabaseBrowserClient } from "@/lib/supabase";

type ReaderRole = "director" | "technician";

export type DirectMessage = {
  body: string;
  client_message_id: string | null;
  created_at: string;
  id: string;
  sender_role: string;
  sender_technician_name: string | null;
  session_id: string;
  show_id: string;
  technician_name: string;
};

type DirectMessageRead = {
  id: string;
  last_read_at: string;
  technician_name: string;
};

const CLOSED_POLL_INTERVAL_MS = 5000;
const OPEN_POLL_INTERVAL_MS = 2500;

export async function purgeDirectMessages(
  supabase: SupabaseClient,
  sessionId: string,
) {
  const readsResult = await supabase
    .from("direct_message_reads")
    .delete()
    .eq("session_id", sessionId);

  if (readsResult.error) {
    return { error: readsResult.error };
  }

  const messagesResult = await supabase
    .from("direct_messages")
    .delete()
    .eq("session_id", sessionId);

  return { error: messagesResult.error };
}

function isOwnMessage(
  message: DirectMessage,
  readerRole: ReaderRole,
  readerTechnicianName: string | null,
) {
  return readerRole === "director"
    ? message.sender_role === "director"
    : message.sender_role === "technician" &&
        message.sender_technician_name === readerTechnicianName;
}

function formatMessageTime(createdAt: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(createdAt));
}

export function useDirectChat({
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
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [readsByTechnician, setReadsByTechnician] = useState<
    Record<string, DirectMessageRead>
  >({});
  const [openTechnicianName, setOpenTechnicianName] = useState<
    string | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const knownMessageIdsRef = useRef<Set<string> | null>(null);
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
        .from("direct_message_reads")
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
        setError(`Could not update DM read state: ${readError.message}`);
        markingReadRef.current.delete(technicianName);
        return;
      }

      const now = new Date().toISOString();
      const result = existing
        ? await supabase
            .from("direct_message_reads")
            .update({ last_read_at: lastReadAt, updated_at: now })
            .eq("id", existing.id)
        : await supabase.from("direct_message_reads").insert({
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
        setError(`Could not update DM read state: ${result.error.message}`);
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
    knownMessageIdsRef.current = null;
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
      setMessages([]);
      setReadsByTechnician({});
      knownMessageIdsRef.current = new Set();
      setError(null);
      return;
    }

    const messagesResult = await supabase
      .from("direct_messages")
      .select(
        "id, show_id, session_id, technician_name, sender_role, sender_technician_name, body, client_message_id, created_at",
      )
      .eq("show_id", showId)
      .eq("session_id", sessionId)
      .in("technician_name", stableTechnicianNames)
      .order("created_at", { ascending: true });

    let readsQuery = supabase
      .from("direct_message_reads")
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
    const queryError = messagesResult.error ?? readsResult.error;

    if (queryError) {
      setError(`Could not load direct messages: ${queryError.message}`);
      return;
    }

    const nextMessages = (messagesResult.data ?? []) as DirectMessage[];
    const previousIds = knownMessageIdsRef.current;

    if (
      previousIds &&
      nextMessages.some(
        (message) =>
          !previousIds.has(message.id) &&
          message.technician_name !== openTechnicianName &&
          !isOwnMessage(
            message,
            readerRole,
            readerTechnicianName,
          ),
      )
    ) {
      playChatMessage();
    }

    knownMessageIdsRef.current = new Set(
      nextMessages.map((message) => message.id),
    );
    const nextReads = Object.fromEntries(
      ((readsResult.data ?? []) as DirectMessageRead[]).map((read) => [
        read.technician_name,
        read,
      ]),
    );
    setMessages(nextMessages);
    setReadsByTechnician(nextReads);
    setError(null);

    if (openTechnicianName) {
      const latestMessage = nextMessages
        .filter(
          (message) =>
            message.technician_name === openTechnicianName,
        )
        .at(-1);
      const currentReadAt =
        nextReads[openTechnicianName]?.last_read_at;

      if (
        latestMessage &&
        (!currentReadAt ||
          Date.parse(latestMessage.created_at) >
            Date.parse(currentReadAt))
      ) {
        void markRead(
          openTechnicianName,
          latestMessage.created_at,
        );
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

  const messagesByTechnician = useMemo(() => {
    const grouped: Record<string, DirectMessage[]> = {};
    messages.forEach((message) => {
      grouped[message.technician_name] = [
        ...(grouped[message.technician_name] ?? []),
        message,
      ];
    });
    return grouped;
  }, [messages]);

  const unreadByTechnician = useMemo(() => {
    const counts: Record<string, number> = {};
    stableTechnicianNames.forEach((technicianName) => {
      const lastReadAt =
        readsByTechnician[technicianName]?.last_read_at;
      counts[technicianName] = (
        messagesByTechnician[technicianName] ?? []
      ).filter(
        (message) =>
          !isOwnMessage(
            message,
            readerRole,
            readerTechnicianName,
          ) &&
          (!lastReadAt ||
            Date.parse(message.created_at) >
              Date.parse(lastReadAt)),
      ).length;
    });
    return counts;
  }, [
    messagesByTechnician,
    readerRole,
    readerTechnicianName,
    readsByTechnician,
    stableTechnicianNames,
  ]);

  const openChat = useCallback(
    (technicianName: string) => {
      setOpenTechnicianName(technicianName);
      const latestMessage = (
        messagesByTechnician[technicianName] ?? []
      ).at(-1);
      if (latestMessage) {
        void markRead(technicianName, latestMessage.created_at);
      }
    },
    [markRead, messagesByTechnician],
  );

  const sendMessage = useCallback(
    async (technicianName: string, body: string) => {
      if (!showId || !sessionId || !body.trim()) {
        return false;
      }

      setIsSending(true);
      setError(null);
      const clientMessageId = window.crypto.randomUUID();
      const result = await supabase.from("direct_messages").insert({
        body: body.trim(),
        client_message_id: clientMessageId,
        sender_role: readerRole,
        sender_technician_name:
          readerRole === "technician"
            ? readerTechnicianName
            : null,
        session_id: sessionId,
        show_id: showId,
        technician_name: technicianName,
      });

      if (result.error) {
        setError(`Could not send DM: ${result.error.message}`);
        setIsSending(false);
        return false;
      }

      await refresh();
      setIsSending(false);
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
    closeChat: () => setOpenTechnicianName(null),
    error,
    isSending,
    messagesByTechnician,
    openChat,
    openTechnicianName,
    refresh,
    sendMessage,
    unreadByTechnician,
  };
}

export function DirectChatButton({
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
          ? `Open DM, ${unreadCount} unread`
          : "Open DM"
      }
      className={`relative inline-flex items-center justify-center rounded-md border text-[#bfdbfe] transition hover:text-white ${
        unreadCount > 0
          ? "border-[#ef4444]/70 bg-[#7f1d1d] shadow-[0_0_14px_rgba(239,68,68,0.28)]"
          : "border-white/15 bg-[#111827] hover:border-[#60a5fa]"
      } ${
        compact
          ? "min-h-7 min-w-7 px-1 text-xs"
          : "min-h-9 min-w-9 px-2 text-sm"
      }`}
      onClick={onClick}
      title="Direct message"
      type="button"
    >
      <span aria-hidden="true">💬</span>
      {unreadCount > 0 ? (
        <span className="absolute -right-2 -top-2 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#ef4444] px-1 text-[10px] font-bold text-white shadow-lg">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
    </button>
  );
}

export function DirectChatWindow({
  error,
  isSending,
  messages,
  onClose,
  onSend,
  readerRole,
  readerTechnicianName,
  technicianName,
}: {
  error: string | null;
  isSending: boolean;
  messages: DirectMessage[];
  onClose: () => void;
  onSend: (body: string) => Promise<boolean>;
  readerRole: ReaderRole;
  readerTechnicianName: string | null;
  technicianName: string;
}) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (await onSend(draft)) {
      setDraft("");
    }
  };

  return (
    <div
      aria-labelledby="direct-chat-title"
      aria-modal="true"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-3 sm:p-5"
      role="dialog"
    >
      <section className="flex max-h-[82dvh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-[#3b82f6]/40 bg-[#0b1020] shadow-2xl shadow-black/70">
        <header className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#93c5fd]">
              Direct Message
            </p>
            <h2 className="mt-1 text-sm font-semibold text-white" id="direct-chat-title">
              Director ↔ {getTemporaryTechnicianLabel(technicianName)}
            </h2>
          </div>
          <button
            className="rounded-md border border-white/15 px-3 py-2 text-sm font-semibold text-[#cbd5e1]"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </header>
        <div className="min-h-48 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/15 p-4 text-center text-sm text-[#94a3b8]">
              No direct messages yet.
            </p>
          ) : (
            messages.map((message) => {
              const own = isOwnMessage(
                message,
                readerRole,
                readerTechnicianName,
              );
              return (
                <div className={`flex ${own ? "justify-end" : "justify-start"}`} key={message.id}>
                  <div className={`max-w-[85%] rounded-lg border px-3 py-2 ${own ? "border-[#8b5cf6]/45 bg-[#1b1235]" : "border-white/10 bg-[#111827]"}`}>
                    <div className="flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-[0.1em]">
                      <span className={own ? "text-[#c4b5fd]" : "text-[#93c5fd]"}>
                        {message.sender_role === "director"
                          ? "Director"
                          : getTemporaryTechnicianLabel(
                              message.sender_technician_name ?? undefined,
                            )}
                      </span>
                      <time className="text-[#64748b]">{formatMessageTime(message.created_at)}</time>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-white">{message.body}</p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>
        <form className="border-t border-white/10 p-3" onSubmit={submit}>
          <textarea
            className="min-h-20 w-full resize-none rounded-lg border border-white/15 bg-[#020617] p-3 text-sm text-white outline-none placeholder:text-[#64748b] focus:border-[#60a5fa]"
            maxLength={1000}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Message the Director or technician"
            value={draft}
          />
          {error ? <p className="mt-2 text-xs font-semibold text-[#fecaca]">{error}</p> : null}
          <div className="mt-2 flex justify-end">
            <button
              className="rounded-md bg-[#2563eb] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              disabled={isSending || !draft.trim()}
              type="submit"
            >
              {isSending ? "Sending..." : "Send"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
