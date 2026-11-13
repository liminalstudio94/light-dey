-- Light Dey? initial schema.
-- Design notes: ARCHITECTURE.md#database
-- The Next.js server writes reports with the secret key (bypasses RLS) after
-- running the anti-abuse rules in src/lib/reports.ts. RLS below protects every
-- table from direct access with the public (anon/publishable) key.

create extension if not exists postgis;
create extension if not exists pgcrypto;

-- ---------- Geography ----------
create table public.states (
  id text primary key,                       -- e.g. 'lagos'
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.cities (
  id text primary key,
  state_id text not null references public.states(id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now(),
  unique (state_id, name)
);

create table public.local_government_areas (
  id text primary key,                       -- e.g. 'lagos-eti-osa'
  state_id text not null references public.states(id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now(),
  unique (state_id, name)
);

create table public.neighbourhoods (
  id text primary key,                       -- stable slug, matches src/lib/areas.ts
  name text not null,
  city_id text not null references public.cities(id) on delete restrict,
  lga_id text not null references public.local_government_areas(id) on delete restrict,
  centroid geography(point, 4326) not null,  -- APPROXIMATE centre
  boundary geography(multipolygon, 4326),    -- null until a reliable dataset exists
  boundary_source text,
  distribution_company text,                 -- null unless from a reliable source
  aliases text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index neighbourhoods_centroid_gix on public.neighbourhoods using gist (centroid);
create index neighbourhoods_city_idx on public.neighbourhoods (city_id);

-- ---------- Users ----------
create type public.user_role as enum ('user', 'moderator', 'admin');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  role public.user_role not null default 'user',
  reputation integer not null default 0,
  is_suspended boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and role in ('moderator', 'admin') and not is_suspended);
$$;

-- ---------- Reports ----------
create type public.power_status as enum ('on', 'off');
create type public.report_verification as enum ('unverified', 'location_matched', 'location_mismatch', 'flagged', 'removed');

create table public.electricity_reports (
  id uuid primary key default gen_random_uuid(),
  neighbourhood_id text not null references public.neighbourhoods(id) on delete restrict,
  status public.power_status not null,
  user_id uuid references public.users(id) on delete set null,   -- signed-in reporter
  reporter_key text not null check (char_length(reporter_key) between 8 and 64), -- anon cookie id or user id
  network_hash text not null check (char_length(network_hash) between 8 and 64), -- HMAC of IP, never raw IP
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  verification public.report_verification not null default 'unverified',
  comment text check (char_length(comment) <= 140),
  created_at timestamptz not null default now(),
  check ((lat is null) = (lng is null))
);
create index electricity_reports_area_time_idx on public.electricity_reports (neighbourhood_id, created_at desc);
create index electricity_reports_reporter_time_idx on public.electricity_reports (reporter_key, created_at desc);
create index electricity_reports_network_time_idx on public.electricity_reports (network_hash, created_at desc);
create index electricity_reports_time_idx on public.electricity_reports (created_at desc);

-- Cached live status per area (written by the server; Phase 2 backlog LD-021).
create table public.neighbourhood_status (
  neighbourhood_id text primary key references public.neighbourhoods(id) on delete cascade,
  state text not null check (state in ('LIGHT', 'NO_LIGHT', 'UNCERTAIN', 'UNKNOWN')),
  on_reporters integer not null default 0,
  off_reporters integer not null default 0,
  recent_reports integer not null default 0,
  confidence text not null check (confidence in ('high', 'medium', 'low', 'none')),
  last_report_at timestamptz,
  computed_at timestamptz not null default now()
);

-- Confirmed status transitions (LIGHT <-> NO_LIGHT etc).
create table public.status_history (
  id bigint generated always as identity primary key,
  neighbourhood_id text not null references public.neighbourhoods(id) on delete cascade,
  from_state text,
  to_state text not null,
  changed_at timestamptz not null default now(),
  confirming_reporters integer not null default 0
);
create index status_history_area_time_idx on public.status_history (neighbourhood_id, changed_at desc);

-- ---------- Engagement ----------
create table public.user_follows (
  user_id uuid not null references public.users(id) on delete cascade,
  neighbourhood_id text not null references public.neighbourhoods(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, neighbourhood_id)
);

create table public.notification_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  push_enabled boolean not null default false,
  email_enabled boolean not null default false,
  notify_light_on boolean not null default true,
  notify_light_off boolean not null default true,
  quiet_hours_start smallint check (quiet_hours_start between 0 and 23),
  quiet_hours_end smallint check (quiet_hours_end between 0 and 23),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  neighbourhood_id text references public.neighbourhoods(id) on delete cascade,
  kind text not null check (kind in ('light_on', 'light_off', 'status_change')),
  channel text not null check (channel in ('push', 'email', 'whatsapp', 'in_app')),
  body text not null,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------- Moderation ----------
create table public.report_flags (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.electricity_reports(id) on delete cascade,
  flagged_by text not null,                  -- reporter_key of the flagger
  reason text not null check (reason in ('false', 'spam', 'abuse', 'other')),
  created_at timestamptz not null default now(),
  unique (report_id, flagged_by)
);

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  moderator_id uuid not null references public.users(id) on delete restrict,
  target_type text not null check (target_type in ('report', 'user', 'neighbourhood')),
  target_id text not null,
  action text not null check (action in ('remove_report', 'restore_report', 'suspend_user', 'unsuspend_user', 'edit_neighbourhood')),
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);

-- ---------- Row Level Security ----------
alter table public.states enable row level security;
alter table public.cities enable row level security;
alter table public.local_government_areas enable row level security;
alter table public.neighbourhoods enable row level security;
alter table public.users enable row level security;
alter table public.electricity_reports enable row level security;
alter table public.neighbourhood_status enable row level security;
alter table public.status_history enable row level security;
alter table public.user_follows enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notifications enable row level security;
alter table public.report_flags enable row level security;
alter table public.moderation_actions enable row level security;

-- Public reference + aggregate data: read-only for everyone.
create policy "public read" on public.states for select using (true);
create policy "public read" on public.cities for select using (true);
create policy "public read" on public.local_government_areas for select using (true);
create policy "public read" on public.neighbourhoods for select using (is_active);
create policy "public read" on public.neighbourhood_status for select using (true);
create policy "public read" on public.status_history for select using (true);

-- Users: see and edit only your own profile, and never your own role/reputation.
create policy "own profile read" on public.users for select using (id = auth.uid() or public.is_staff());
create policy "own profile update" on public.users for update using (id = auth.uid()) with check (id = auth.uid());
-- Column-level grant: users can change their display name only, never role/reputation/suspension.
revoke update on public.users from anon, authenticated;
grant update (display_name) on public.users to authenticated;

-- Reports: no direct inserts/updates/deletes with public keys (server only).
-- Signed-in users may read their own reports; staff may read all.
create policy "own reports read" on public.electricity_reports for select using (user_id = auth.uid() or public.is_staff());

create policy "own follows" on public.user_follows for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own prefs" on public.notification_preferences for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own notifications read" on public.notifications for select using (user_id = auth.uid());
create policy "own notifications mark read" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "staff read flags" on public.report_flags for select using (public.is_staff());
create policy "staff read actions" on public.moderation_actions for select using (public.is_staff());

-- Hide raw tables from anon beyond the policies above.
revoke all on public.electricity_reports from anon;
revoke all on public.report_flags, public.moderation_actions from anon;

-- New auth users get a profile row.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
