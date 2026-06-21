create table if not exists public.issue_messages (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  session_id uuid references public.continuity_sessions(id) on delete cascade,
  sender_role text not null,
  sender_technician_name text,
  body text not null,
  client_message_id text,
  created_at timestamptz not null default now()
);

create index if not exists issue_messages_issue_id_idx
  on public.issue_messages (issue_id);

create index if not exists issue_messages_show_id_idx
  on public.issue_messages (show_id);

create index if not exists issue_messages_session_id_idx
  on public.issue_messages (session_id);

create index if not exists issue_messages_created_at_idx
  on public.issue_messages (created_at);

create index if not exists issue_messages_show_session_idx
  on public.issue_messages (show_id, session_id);

create index if not exists issue_messages_issue_created_at_idx
  on public.issue_messages (issue_id, created_at);

create unique index if not exists issue_messages_client_message_id_key
  on public.issue_messages (client_message_id)
  where client_message_id is not null;

comment on table public.issue_messages is
  'Stores temporary issue-scoped chat messages for Director/Tech communication during a continuity session. Messages should be purged when the continuity session ends.';

create table if not exists public.issue_message_reads (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  session_id uuid references public.continuity_sessions(id) on delete cascade,
  reader_role text not null,
  reader_technician_name text,
  last_read_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists issue_message_reads_issue_id_idx
  on public.issue_message_reads (issue_id);

create index if not exists issue_message_reads_show_id_idx
  on public.issue_message_reads (show_id);

create index if not exists issue_message_reads_session_id_idx
  on public.issue_message_reads (session_id);

create index if not exists issue_message_reads_show_session_idx
  on public.issue_message_reads (show_id, session_id);

create index if not exists issue_message_reads_issue_reader_idx
  on public.issue_message_reads (
    issue_id,
    reader_role,
    reader_technician_name
  );

create unique index if not exists issue_message_reads_director_key
  on public.issue_message_reads (issue_id, reader_role)
  where reader_role = 'director';

create unique index if not exists issue_message_reads_technician_key
  on public.issue_message_reads (
    issue_id,
    reader_role,
    reader_technician_name
  )
  where reader_technician_name is not null;

comment on table public.issue_message_reads is
  'Tracks per-reader last-read time for unread chat badges.';
