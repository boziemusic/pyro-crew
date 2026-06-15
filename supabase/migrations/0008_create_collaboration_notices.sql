create table if not exists public.additional_technician_assignments (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  session_id uuid references public.continuity_sessions(id) on delete set null,
  primary_technician_name text not null,
  additional_technician_name text not null,
  status text not null default 'active',
  requested_note text,
  director_note text,
  assigned_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists additional_technician_assignments_issue_id_idx
  on public.additional_technician_assignments (issue_id);

create index if not exists additional_technician_assignments_show_id_idx
  on public.additional_technician_assignments (show_id);

create index if not exists additional_technician_assignments_session_id_idx
  on public.additional_technician_assignments (session_id);

create index if not exists additional_technician_assignments_primary_technician_idx
  on public.additional_technician_assignments (primary_technician_name);

create index if not exists additional_technician_assignments_additional_technician_idx
  on public.additional_technician_assignments (additional_technician_name);

create index if not exists additional_technician_assignments_show_session_idx
  on public.additional_technician_assignments (show_id, session_id);

create index if not exists additional_technician_assignments_issue_status_idx
  on public.additional_technician_assignments (issue_id, status);

comment on table public.additional_technician_assignments is
  'Stores Director-approved extra technician help on an issue.';

create table if not exists public.technician_notices (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid references public.issues(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  session_id uuid references public.continuity_sessions(id) on delete set null,
  technician_name text not null,
  notice_type text not null,
  title text not null,
  message text,
  status text not null default 'unread',
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz
);

create index if not exists technician_notices_issue_id_idx
  on public.technician_notices (issue_id);

create index if not exists technician_notices_show_id_idx
  on public.technician_notices (show_id);

create index if not exists technician_notices_session_id_idx
  on public.technician_notices (session_id);

create index if not exists technician_notices_technician_name_idx
  on public.technician_notices (technician_name);

create index if not exists technician_notices_status_idx
  on public.technician_notices (status);

create index if not exists technician_notices_technician_status_idx
  on public.technician_notices (technician_name, status);

create index if not exists technician_notices_show_session_technician_idx
  on public.technician_notices (
    show_id,
    session_id,
    technician_name
  );

comment on table public.technician_notices is
  'Stores cross-device notices such as handoffs, reassignments, Director responses, declined requests, and resolution acknowledgements.';
