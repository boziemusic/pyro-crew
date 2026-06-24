create extension if not exists pgcrypto with schema extensions;

create type public.show_mode as enum (
  'manual',
  'scripted'
);

create type public.show_status as enum (
  'draft'
);

create type public.session_status as enum (
  'active',
  'ended'
);

create type public.issue_source as enum (
  'manual_director_entry'
);

create type public.issue_type as enum (
  'no_continuity',
  'unexpected_continuity',
  'module_offline'
);

create type public.issue_status as enum (
  'new',
  'assigned',
  'in_progress',
  'retrieving_parts',
  'director_assistance_requested',
  'additional_technician_requested',
  'awaiting_verification',
  'verification_failed',
  'verified_resolved',
  'root_cause_required',
  'unfixable_recommended',
  'unfixable',
  'closed'
);

create table public.shows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  name text not null,
  location text,
  show_date date,
  show_mode public.show_mode not null default 'manual',
  status public.show_status not null default 'draft',
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.continuity_sessions (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null,
  name text not null,
  status public.session_status not null default 'active',
  started_by_user_id uuid,
  ended_by_user_id uuid,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint continuity_sessions_show_id_fkey
    foreign key (show_id) references public.shows(id)
);

create table public.issues (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null,
  session_id uuid,
  issue_source public.issue_source not null default 'manual_director_entry',
  issue_type public.issue_type not null default 'no_continuity',
  status public.issue_status not null default 'new',
  channel_number integer not null,
  cue_value text not null,
  position_name text,
  effect_name text,
  assigned_to_user_id uuid,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  director_note text,
  constraint issues_show_id_fkey
    foreign key (show_id) references public.shows(id),
  constraint issues_session_id_fkey
    foreign key (session_id) references public.continuity_sessions(id)
);

create table public.issue_status_history (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null,
  old_status public.issue_status,
  new_status public.issue_status not null,
  changed_by_user_id uuid,
  note text,
  created_at timestamptz not null default now(),
  constraint issue_status_history_issue_id_fkey
    foreign key (issue_id) references public.issues(id)
);

create index continuity_sessions_show_id_idx
  on public.continuity_sessions (show_id);

create index continuity_sessions_show_status_idx
  on public.continuity_sessions (show_id, status);

create index issues_show_id_idx
  on public.issues (show_id);

create index issues_session_id_idx
  on public.issues (session_id);

create index issues_show_session_idx
  on public.issues (show_id, session_id);

create index issues_show_status_idx
  on public.issues (show_id, status);

create index issue_status_history_issue_id_idx
  on public.issue_status_history (issue_id);

create index issue_status_history_issue_created_at_idx
  on public.issue_status_history (issue_id, created_at);
