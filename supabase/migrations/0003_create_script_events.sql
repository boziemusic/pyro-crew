create table if not exists public.script_events (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  channel_number int not null,
  cue_value text not null,
  position_name text,
  effect_name text,
  raw_row jsonb,
  created_at timestamptz not null default now()
);

create index if not exists script_events_show_id_idx
  on public.script_events (show_id);

create index if not exists script_events_show_channel_cue_idx
  on public.script_events (show_id, channel_number, cue_value);

comment on table public.script_events is
  'Stores parsed firing-system script rows normalized through script adapters such as cobra_6x.';

comment on column public.script_events.cue_value is
  'Stored as text to support cue ranges or non-numeric cue formats in future firing systems.';

comment on column public.script_events.raw_row is
  'Preserves the source row data supplied by the firing-system script adapter.';
