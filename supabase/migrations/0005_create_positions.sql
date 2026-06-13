create table if not exists public.position_groups (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.positions (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  group_id uuid references public.position_groups(id) on delete set null,
  name text not null,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists position_groups_show_id_idx
  on public.position_groups (show_id);

create unique index if not exists position_groups_show_name_key
  on public.position_groups (show_id, name);

create index if not exists positions_show_id_idx
  on public.positions (show_id);

create index if not exists positions_group_id_idx
  on public.positions (group_id);

create unique index if not exists positions_show_name_key
  on public.positions (show_id, name);

comment on table public.position_groups is
  'Stores optional show-scoped grouping containers for physical launch positions, such as F1.';

comment on table public.positions is
  'Stores show-scoped physical launch positions.';

comment on column public.positions.source is
  'Identifies whether a position was created manually or imported from a script, using values such as manual or script_imported.';
