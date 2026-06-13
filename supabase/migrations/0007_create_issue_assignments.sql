create table if not exists public.issue_assignments (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  session_id uuid references public.continuity_sessions(id) on delete set null,
  technician_name text not null,
  status text not null default 'active',
  assigned_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists issue_assignments_issue_id_idx
  on public.issue_assignments (issue_id);

create index if not exists issue_assignments_show_id_idx
  on public.issue_assignments (show_id);

create index if not exists issue_assignments_session_id_idx
  on public.issue_assignments (session_id);

create index if not exists issue_assignments_technician_name_idx
  on public.issue_assignments (technician_name);

create index if not exists issue_assignments_show_session_technician_idx
  on public.issue_assignments (show_id, session_id, technician_name);

create index if not exists issue_assignments_issue_status_idx
  on public.issue_assignments (issue_id, status);

create unique index if not exists issue_assignments_one_active_per_issue_key
  on public.issue_assignments (issue_id)
  where status = 'active';

comment on table public.issue_assignments is
  'Stores shared technician ownership and assignment state for continuity issues.';

comment on column public.issue_assignments.status is
  'Assignment lifecycle status, initially supporting active, reassigned, completed, and acknowledged.';
