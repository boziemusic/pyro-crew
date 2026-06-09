alter table public.shows
  add column if not exists firing_system text,
  add column if not exists script_adapter text,
  add column if not exists script_filename text,
  add column if not exists script_uploaded_at timestamptz;

comment on column public.shows.firing_system is
  'Stores the app-level supported firing system key, for example cobra_6x.';

comment on column public.shows.script_adapter is
  'Stores the script parser adapter key, for example cobra_6x.';

comment on column public.shows.script_filename is
  'Stores the uploaded script filename.';

comment on column public.shows.script_uploaded_at is
  'Stores the script upload timestamp.';
