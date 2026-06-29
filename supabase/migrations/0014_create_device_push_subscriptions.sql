create table if not exists public.device_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  endpoint text not null,
  push_subscription jsonb not null,
  browser_name text,
  platform_name text,
  user_agent text,
  app_name text not null default 'continuity',
  permission_status text not null default 'default',
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists device_push_subscriptions_endpoint_key
  on public.device_push_subscriptions (endpoint);

create index if not exists device_push_subscriptions_device_id_idx
  on public.device_push_subscriptions (device_id);

create index if not exists device_push_subscriptions_app_name_idx
  on public.device_push_subscriptions (app_name);

create index if not exists device_push_subscriptions_is_active_idx
  on public.device_push_subscriptions (is_active);

create index if not exists device_push_subscriptions_last_seen_at_idx
  on public.device_push_subscriptions (last_seen_at);

comment on table public.device_push_subscriptions is
  'Stores device-scoped browser push subscriptions for Pyro Crew notifications across reusable Pyro Crew modules.';

comment on column public.device_push_subscriptions.app_name is
  'Identifies the Pyro Crew module or app surface that registered the subscription, such as continuity.';

comment on column public.device_push_subscriptions.push_subscription is
  'Raw PushSubscription JSON used by future notification delivery services.';

comment on column public.device_push_subscriptions.device_id is
  'Stable browser/device identifier for this installation. Show/session/technician relationships are derived elsewhere from presence and join state.';

alter table public.device_push_subscriptions enable row level security;

create policy "anon select device push subscriptions"
  on public.device_push_subscriptions
  for select
  to anon
  using (true);

create policy "anon insert device push subscriptions"
  on public.device_push_subscriptions
  for insert
  to anon
  with check (true);

create policy "anon update device push subscriptions"
  on public.device_push_subscriptions
  for update
  to anon
  using (true)
  with check (true);

create policy "anon delete device push subscriptions"
  on public.device_push_subscriptions
  for delete
  to anon
  using (true);