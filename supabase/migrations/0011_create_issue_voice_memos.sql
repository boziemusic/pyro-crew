create table if not exists public.issue_voice_memos (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  session_id uuid not null references public.continuity_sessions(id) on delete cascade,
  sender_role text not null,
  sender_technician_name text,
  storage_path text not null unique,
  mime_type text not null,
  duration_ms integer not null,
  file_size_bytes bigint not null,
  client_memo_id text,
  created_at timestamptz not null default now()
);

create index if not exists issue_voice_memos_issue_id_idx
  on public.issue_voice_memos (issue_id);

create index if not exists issue_voice_memos_show_id_idx
  on public.issue_voice_memos (show_id);

create index if not exists issue_voice_memos_session_id_idx
  on public.issue_voice_memos (session_id);

create index if not exists issue_voice_memos_created_at_idx
  on public.issue_voice_memos (created_at);

create index if not exists issue_voice_memos_show_session_idx
  on public.issue_voice_memos (show_id, session_id);

create index if not exists issue_voice_memos_issue_created_at_idx
  on public.issue_voice_memos (issue_id, created_at);

create unique index if not exists issue_voice_memos_client_memo_id_key
  on public.issue_voice_memos (client_memo_id)
  where client_memo_id is not null;

comment on table public.issue_voice_memos is
  'Stores metadata for temporary issue-scoped voice memos. Audio files live in Supabase Storage bucket issue-voice-memos. Memos should be purged when the issue closes or session ends.';

create table if not exists public.issue_voice_memo_reads (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  session_id uuid not null references public.continuity_sessions(id) on delete cascade,
  reader_role text not null,
  reader_technician_name text,
  last_read_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists issue_voice_memo_reads_issue_id_idx
  on public.issue_voice_memo_reads (issue_id);

create index if not exists issue_voice_memo_reads_show_id_idx
  on public.issue_voice_memo_reads (show_id);

create index if not exists issue_voice_memo_reads_session_id_idx
  on public.issue_voice_memo_reads (session_id);

create index if not exists issue_voice_memo_reads_show_session_idx
  on public.issue_voice_memo_reads (show_id, session_id);

create index if not exists issue_voice_memo_reads_issue_reader_idx
  on public.issue_voice_memo_reads (
    issue_id,
    reader_role,
    reader_technician_name
  );

create unique index if not exists issue_voice_memo_reads_director_key
  on public.issue_voice_memo_reads (issue_id, reader_role)
  where reader_role = 'director';

create unique index if not exists issue_voice_memo_reads_technician_key
  on public.issue_voice_memo_reads (
    issue_id,
    reader_role,
    reader_technician_name
  )
  where reader_technician_name is not null;

comment on table public.issue_voice_memo_reads is
  'Tracks per-reader last-read time for voice memo unread badges.';
