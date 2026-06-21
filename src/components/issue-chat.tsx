"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getTemporaryTechnicianLabel } from "./temporary-technician-store";
import { playChatMessage } from "@/lib/app-feedback";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export type IssueChatMessage = {
  body: string;
  client_message_id: string | null;
  created_at: string;
  id: string;
  issue_id: string;
  sender_role: string;
  sender_technician_name: string | null;
  session_id: string | null;
  show_id: string;
};

type IssueMessageRead = {
  id: string;
  issue_id: string;
  last_read_at: string;
};

export type IssueChatTarget = {
  channelNumber: number;
  cueValue: string;
  id: string;
  positionName: string | null;
};

type ReaderRole = "director" | "technician";

const CLOSED_POLL_INTERVAL_MS = 5000;
const OPEN_POLL_INTERVAL_MS = 2500;

export async function purgeIssueChatSession(
  supabase: SupabaseClient,
  sessionId: string,
) {
  const readsResult = await supabase
    .from("issue_message_reads")
    .delete()
    .eq("session_id", sessionId);

  if (readsResult.error) {
    return { error: readsResult.error };
  }

  const messagesResult = await supabase
    .from("issue_messages")
    .delete()
    .eq("session_id", sessionId);

  return { error: messagesResult.error };
}

function isOwnMessage(
  message: IssueChatMessage,
  readerRole: ReaderRole,
  readerTechnicianName: string | null,
) {
  if (readerRole === "director") {
    return message.sender_role === "director";
  }

  return (
    message.sender_role === "technician" &&
    message.sender_technician_name === readerTechnicianName
  );
}

function formatMessageTime(createdAt: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(createdAt));
}

export function useIssueChat({
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
  const [messages, setMessages] = useState<IssueChatMessage[]>([]);
  const [readsByIssue, setReadsByIssue] = useState<
    Record<string, IssueMessageRead>
  >({});
  const [openIssueId, setOpenIssueId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const knownMessageIdsRef = useRef<Set<string> | null>(null);
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
        .from("issue_message_reads")
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
        setError(`Could not update chat read state: ${readError.message}`);
        markingReadIssueIdsRef.current.delete(issueId);
        return;
      }

      const now = new Date().toISOString();
      const result = existing
        ? await supabase
            .from("issue_message_reads")
            .update({
              last_read_at: lastReadAt,
              updated_at: now,
            })
            .eq("id", existing.id)
        : await supabase.from("issue_message_reads").insert({
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
          `Could not update chat read state: ${result.error.message}`,
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
    knownMessageIdsRef.current = null;
  }, [
    issueIdsKey,
    readerRole,
    readerTechnicianName,
    sessionId,
    showId,
  ]);

  const refresh = useCallback(async () => {
    if (!showId || !sessionId || stableIssueIds.length === 0) {
      setMessages([]);
      setReadsByIssue({});
      knownMessageIdsRef.current = new Set();
      setError(null);
      return;
    }

    const messagesResult = await supabase
      .from("issue_messages")
      .select(
        "id, issue_id, show_id, session_id, sender_role, sender_technician_name, body, client_message_id, created_at",
      )
      .eq("show_id", showId)
      .eq("session_id", sessionId)
      .in("issue_id", stableIssueIds)
      .order("created_at", { ascending: true });

    let readsQuery = supabase
      .from("issue_message_reads")
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
    const queryError = messagesResult.error ?? readsResult.error;

    if (queryError) {
      setError(`Could not load issue chat: ${queryError.message}`);
      return;
    }

    const nextMessages = (messagesResult.data ?? []) as IssueChatMessage[];
    const previousIds = knownMessageIdsRef.current;

    if (previousIds) {
      const hasClosedChatMessage = nextMessages.some(
        (message) =>
          !previousIds.has(message.id) &&
          message.issue_id !== openIssueId &&
          !isOwnMessage(
            message,
            readerRole,
            readerTechnicianName,
          ),
      );

      if (hasClosedChatMessage) {
        playChatMessage();
      }
    }

    knownMessageIdsRef.current = new Set(
      nextMessages.map((message) => message.id),
    );
    const nextReads = Object.fromEntries(
      ((readsResult.data ?? []) as IssueMessageRead[]).map((read) => [
        read.issue_id,
        read,
      ]),
    );

    setMessages(nextMessages);
    setReadsByIssue(nextReads);
    setError(null);

    if (openIssueId) {
      const openMessages = nextMessages.filter(
        (message) => message.issue_id === openIssueId,
      );
      const latestMessage = openMessages.at(-1);
      const currentReadAt = nextReads[openIssueId]?.last_read_at;

      if (
        latestMessage &&
        (!currentReadAt ||
          Date.parse(latestMessage.created_at) >
            Date.parse(currentReadAt))
      ) {
        void markRead(openIssueId, latestMessage.created_at);
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

  const messagesByIssue = useMemo(() => {
    const grouped: Record<string, IssueChatMessage[]> = {};

    messages.forEach((message) => {
      grouped[message.issue_id] = [
        ...(grouped[message.issue_id] ?? []),
        message,
      ];
    });

    return grouped;
  }, [messages]);

  const unreadByIssue = useMemo(() => {
    const counts: Record<string, number> = {};

    stableIssueIds.forEach((issueId) => {
      const lastReadAt = readsByIssue[issueId]?.last_read_at;
      counts[issueId] = (messagesByIssue[issueId] ?? []).filter(
        (message) =>
          !isOwnMessage(
            message,
            readerRole,
            readerTechnicianName,
          ) &&
          (!lastReadAt ||
            Date.parse(message.created_at) > Date.parse(lastReadAt)),
      ).length;
    });

    return counts;
  }, [
    messagesByIssue,
    readerRole,
    readerTechnicianName,
    readsByIssue,
    stableIssueIds,
  ]);

  const openChat = useCallback(
    (issueId: string) => {
      setOpenIssueId(issueId);
      const latestMessage = (messagesByIssue[issueId] ?? []).at(-1);

      if (latestMessage) {
        void markRead(issueId, latestMessage.created_at);
      }
    },
    [markRead, messagesByIssue],
  );

  const closeChat = useCallback(() => setOpenIssueId(null), []);

  const sendMessage = useCallback(
    async (issueId: string, body: string) => {
      if (!showId || !sessionId || !body.trim()) {
        return false;
      }

      setIsSending(true);
      setError(null);
      const clientMessageId =
        typeof window !== "undefined" && window.crypto?.randomUUID
          ? window.crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const { error: sendError } = await supabase
        .from("issue_messages")
        .insert({
          body: body.trim(),
          client_message_id: clientMessageId,
          issue_id: issueId,
          sender_role: readerRole,
          sender_technician_name:
            readerRole === "technician"
              ? readerTechnicianName
              : null,
          session_id: sessionId,
          show_id: showId,
        });

      if (sendError) {
        setError(`Could not send chat message: ${sendError.message}`);
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
    closeChat,
    error,
    isSending,
    messagesByIssue,
    openChat,
    openIssueId,
    refresh,
    sendMessage,
    unreadByIssue,
  };
}

export function IssueChatButton({
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
          ? `Open issue chat, ${unreadCount} unread`
          : "Open issue chat"
      }
      className={`relative inline-flex items-center justify-center rounded-md border border-[#3b82f6]/35 bg-[#0b1b35] text-[#bfdbfe] transition hover:border-[#60a5fa] hover:text-white ${
        compact
          ? "min-h-7 min-w-7 px-1 text-xs"
          : "min-h-9 min-w-9 px-2 text-sm"
      }`}
      onClick={onClick}
      title="Issue chat"
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

export function IssueChatWindow({
  error,
  isSending,
  messages,
  onClose,
  onSend,
  readerRole,
  readerTechnicianName,
  target,
}: {
  error: string | null;
  isSending: boolean;
  messages: IssueChatMessage[];
  onClose: () => void;
  onSend: (body: string) => Promise<boolean>;
  readerRole: ReaderRole;
  readerTechnicianName: string | null;
  target: IssueChatTarget;
}) {
  const [draft, setDraft] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (await onSend(draft)) {
      setDraft("");
    }
  };

  return (
    <div
      aria-labelledby="issue-chat-title"
      aria-modal="true"
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/65 p-3 sm:items-center sm:p-5"
      role="dialog"
    >
      <section className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-[#3b82f6]/40 bg-[#0b1020] shadow-2xl shadow-black/70">
        <header className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#93c5fd]">
              Issue Chat
            </p>
            <h2
              className="mt-1 text-sm font-semibold text-white"
              id="issue-chat-title"
            >
              CH {target.channelNumber} | Cue(s) {target.cueValue}
            </h2>
            <p className="mt-1 text-xs text-[#94a3b8]">
              Position: {target.positionName ?? "—"}
            </p>
          </div>
          <button
            aria-label="Close issue chat"
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
              No messages yet.
            </p>
          ) : (
            messages.map((message) => {
              const ownMessage = isOwnMessage(
                message,
                readerRole,
                readerTechnicianName,
              );
              const senderLabel =
                message.sender_role === "director"
                  ? "Director"
                  : getTemporaryTechnicianLabel(
                      message.sender_technician_name ?? undefined,
                    );

              return (
                <div
                  className={`flex ${ownMessage ? "justify-end" : "justify-start"}`}
                  key={message.id}
                >
                  <div
                    className={`max-w-[85%] rounded-lg border px-3 py-2 ${
                      ownMessage
                        ? "border-[#8b5cf6]/45 bg-[#1b1235]"
                        : "border-white/10 bg-[#111827]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-[0.1em]">
                      <span
                        className={
                          ownMessage
                            ? "text-[#c4b5fd]"
                            : "text-[#93c5fd]"
                        }
                      >
                        {senderLabel}
                      </span>
                      <time className="text-[#64748b]">
                        {formatMessageTime(message.created_at)}
                      </time>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-white">
                      {message.body}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <form
          className="border-t border-white/10 p-3"
          onSubmit={handleSubmit}
        >
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
            placeholder="Message team members assigned to this issue"
            value={draft}
          />
          {error ? (
            <p className="mt-2 text-xs font-semibold text-[#fecaca]">
              {error}
            </p>
          ) : null}
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-[11px] text-[#64748b]">
              Director, primary tech, and helpers
            </span>
            <button
              className="rounded-md bg-[#2563eb] px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
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
