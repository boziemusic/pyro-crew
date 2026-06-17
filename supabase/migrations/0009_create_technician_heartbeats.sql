create table if not exists public.technician_heartbeats (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  session_id uuid not null references public.continuity_sessions(id) on delete cascade,
  technician_name text not null,
  device_id text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists technician_heartbeats_show_id_idx
  on public.technician_heartbeats (show_id);

create index if not exists technician_heartbeats_session_id_idx
  on public.technician_heartbeats (session_id);

create index if not exists technician_heartbeats_technician_name_idx
  on public.technician_heartbeats (technician_name);

create index if not exists technician_heartbeats_last_seen_at_idx
  on public.technician_heartbeats (last_seen_at);

create index if not exists technician_heartbeats_show_session_idx
  on public.technician_heartbeats (show_id, session_id);

create unique index if not exists technician_heartbeats_show_session_tech_device_key
  on public.technician_heartbeats (
    show_id,
    session_id,
    technician_name,
    device_id
  );

comment on table public.technician_heartbeats is
  'Stores session-scoped technician presence and last-seen connectivity state.';

comment on column public.technician_heartbeats.device_id is
  'Allows the same technician name to exist on more than one browser or device during testing.';
