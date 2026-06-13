alter table public.shows
  add column if not exists field_map_image_path text,
  add column if not exists field_map_uploaded_at timestamptz;

create table if not exists public.field_map_markers (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  marker_type text not null,
  marker_name text not null,
  x_percent numeric not null,
  y_percent numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists field_map_markers_show_id_idx
  on public.field_map_markers (show_id);

create index if not exists field_map_markers_show_type_name_idx
  on public.field_map_markers (show_id, marker_type, marker_name);

comment on column public.shows.field_map_image_path is
  'Stores the Supabase Storage path for the uploaded field map image.';

comment on table public.field_map_markers is
  'Stores show-scoped field map marker coordinates as percentages.';

comment on column public.field_map_markers.marker_type is
  'Initially identifies a marker as either position or group.';
