create table if not exists public.technician_alert_reads (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  session_id uuid references public.continuity_sessions(id) on delete cascade,
  technician_name text not null,
  device_id text not null,
  alert_key text not null,
  alert_type text not null,
  source_id uuid not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists technician_alert_reads_device_alert_key
  on public.technician_alert_reads (device_id, alert_key);

create index if not exists technician_alert_reads_show_session_technician_idx
  on public.technician_alert_reads (show_id, session_id, technician_name);

create index if not exists technician_alert_reads_alert_key_idx
  on public.technician_alert_reads (alert_key);

create index if not exists technician_alert_reads_last_seen_at_idx
  on public.technician_alert_reads (last_seen_at);

comment on table public.technician_alert_reads is
  'Stores durable technician/device alert seen state for notification recovery and Director visibility.';

comment on column public.technician_alert_reads.alert_key is
  'Stable source key such as assignment:<id> or notice:<id>.';

comment on column public.technician_alert_reads.source_id is
  'UUID of the source assignment or technician notice row.';

alter table public.technician_alert_reads enable row level security;

create policy "dev anon select technician alert reads"
  on public.technician_alert_reads
  for select
  to anon
  using (true);

create policy "dev anon insert technician alert reads"
  on public.technician_alert_reads
  for insert
  to anon
  with check (true);

create policy "dev anon update technician alert reads"
  on public.technician_alert_reads
  for update
  to anon
  using (true)
  with check (true);

create policy "dev anon delete technician alert reads"
  on public.technician_alert_reads
  for delete
  to anon
  using (true);