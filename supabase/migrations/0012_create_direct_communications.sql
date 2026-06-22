create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  session_id uuid not null references public.continuity_sessions(id) on delete cascade,
  technician_name text not null,
  sender_role text not null,
  sender_technician_name text,
  body text not null,
  client_message_id text,
  created_at timestamptz not null default now()
);

create index if not exists direct_messages_show_id_idx
  on public.direct_messages (show_id);

create index if not exists direct_messages_session_id_idx
  on public.direct_messages (session_id);

create index if not exists direct_messages_technician_name_idx
  on public.direct_messages (technician_name);

create index if not exists direct_messages_created_at_idx
  on public.direct_messages (created_at);

create index if not exists direct_messages_show_session_idx
  on public.direct_messages (show_id, session_id);

create index if not exists direct_messages_show_session_technician_idx
  on public.direct_messages (show_id, session_id, technician_name);

create index if not exists direct_messages_technician_created_at_idx
  on public.direct_messages (technician_name, created_at);

create unique index if not exists direct_messages_client_message_id_key
  on public.direct_messages (client_message_id)
  where client_message_id is not null;

comment on table public.direct_messages is
  'Stores temporary direct text messages between Director and a technician during a continuity session. Purged when the continuity session ends.';

create table if not exists public.direct_message_reads (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  session_id uuid not null references public.continuity_sessions(id) on delete cascade,
  technician_name text not null,
  reader_role text not null,
  reader_technician_name text,
  last_read_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists direct_message_reads_show_id_idx
  on public.direct_message_reads (show_id);

create index if not exists direct_message_reads_session_id_idx
  on public.direct_message_reads (session_id);

create index if not exists direct_message_reads_technician_name_idx
  on public.direct_message_reads (technician_name);

create index if not exists direct_message_reads_show_session_idx
  on public.direct_message_reads (show_id, session_id);

create index if not exists direct_message_reads_show_session_technician_idx
  on public.direct_message_reads (show_id, session_id, technician_name);

create index if not exists direct_message_reads_technician_reader_idx
  on public.direct_message_reads (
    technician_name,
    reader_role,
    reader_technician_name
  );

create unique index if not exists direct_message_reads_director_key
  on public.direct_message_reads (
    show_id,
    session_id,
    technician_name,
    reader_role
  )
  where reader_role = 'director';

create unique index if not exists direct_message_reads_technician_key
  on public.direct_message_reads (
    show_id,
    session_id,
    technician_name,
    reader_role,
    reader_technician_name
  )
  where reader_technician_name is not null;

comment on table public.direct_message_reads is
  'Tracks per-reader last-read time for direct text message unread badges.';

create table if not exists public.direct_voice_memos (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  session_id uuid not null references public.continuity_sessions(id) on delete cascade,
  technician_name text not null,
  sender_role text not null,
  sender_technician_name text,
  storage_path text not null unique,
  mime_type text not null,
  duration_ms integer not null,
  file_size_bytes bigint not null,
  client_memo_id text,
  created_at timestamptz not null default now()
);

create index if not exists direct_voice_memos_show_id_idx
  on public.direct_voice_memos (show_id);

create index if not exists direct_voice_memos_session_id_idx
  on public.direct_voice_memos (session_id);

create index if not exists direct_voice_memos_technician_name_idx
  on public.direct_voice_memos (technician_name);

create index if not exists direct_voice_memos_created_at_idx
  on public.direct_voice_memos (created_at);

create index if not exists direct_voice_memos_show_session_idx
  on public.direct_voice_memos (show_id, session_id);

create index if not exists direct_voice_memos_show_session_technician_idx
  on public.direct_voice_memos (
    show_id,
    session_id,
    technician_name
  );

create index if not exists direct_voice_memos_technician_created_at_idx
  on public.direct_voice_memos (technician_name, created_at);

create unique index if not exists direct_voice_memos_client_memo_id_key
  on public.direct_voice_memos (client_memo_id)
  where client_memo_id is not null;

comment on table public.direct_voice_memos is
  'Stores metadata for temporary direct voice chat between Director and a technician. Audio files should live in Supabase Storage bucket direct-voice-chat. Purged when the continuity session ends.';

create table if not exists public.direct_voice_memo_reads (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  session_id uuid not null references public.continuity_sessions(id) on delete cascade,
  technician_name text not null,
  reader_role text not null,
  reader_technician_name text,
  last_read_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists direct_voice_memo_reads_show_id_idx
  on public.direct_voice_memo_reads (show_id);

create index if not exists direct_voice_memo_reads_session_id_idx
  on public.direct_voice_memo_reads (session_id);

create index if not exists direct_voice_memo_reads_technician_name_idx
  on public.direct_voice_memo_reads (technician_name);

create index if not exists direct_voice_memo_reads_show_session_idx
  on public.direct_voice_memo_reads (show_id, session_id);

create index if not exists direct_voice_memo_reads_show_session_technician_idx
  on public.direct_voice_memo_reads (
    show_id,
    session_id,
    technician_name
  );

create index if not exists direct_voice_memo_reads_technician_reader_idx
  on public.direct_voice_memo_reads (
    technician_name,
    reader_role,
    reader_technician_name
  );

create unique index if not exists direct_voice_memo_reads_director_key
  on public.direct_voice_memo_reads (
    show_id,
    session_id,
    technician_name,
    reader_role
  )
  where reader_role = 'director';

create unique index if not exists direct_voice_memo_reads_technician_key
  on public.direct_voice_memo_reads (
    show_id,
    session_id,
    technician_name,
    reader_role,
    reader_technician_name
  )
  where reader_technician_name is not null;

comment on table public.direct_voice_memo_reads is
  'Tracks per-reader last-read time for direct voice chat unread badges.';
