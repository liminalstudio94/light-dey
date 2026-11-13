-- Light Dey? initial schema.
-- Design notes: ARCHITECTURE.md#database
-- Everything lives in its own `lightdey` schema so it can share a Supabase
-- project with other apps without name clashes. The schema is NOT exposed via
-- the Supabase Data API; only the Next.js server reaches it, over a direct
-- Postgres connection, after running the rules in src/lib/reports.ts.
-- RLS is still enabled everywhere as defence in depth.

create schema if not exists lightdey;
revoke all on schema lightdey from public, anon, authenticated;
set local search_path = lightdey, extensions, public;

-- ---------- Geography ----------
create table lightdey.states (
  id text primary key,                       -- e.g. 'lagos'
  name text not null unique,
  created_at timestamptz not null default now()
);

create table lightdey.cities (
  id text primary key,
  state_id text not null references lightdey.states(id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now(),
  unique (state_id, name)
);

create table lightdey.local_government_areas (
  id text primary key,                       -- e.g. 'lagos-eti-osa'
  state_id text not null references lightdey.states(id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now(),
  unique (state_id, name)
);

create table lightdey.neighbourhoods (
  id text primary key,                       -- stable slug, matches src/lib/areas.ts
  name text not null,
  city_id text not null references lightdey.cities(id) on delete restrict,
  lga_id text not null references lightdey.local_government_areas(id) on delete restrict,
  lat double precision not null check (lat between -90 and 90),   -- APPROXIMATE centre
  lng double precision not null check (lng between -180 and 180),
  boundary_geojson jsonb,                    -- null until a reliable dataset exists (PostGIS later: LD-031)
  boundary_source text,
  distribution_company text,                 -- null unless from a reliable source
  aliases text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index neighbourhoods_city_idx on lightdey.neighbourhoods (city_id);

-- ---------- Users ----------
create type lightdey.user_role as enum ('user', 'moderator', 'admin');

create table lightdey.users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  role lightdey.user_role not null default 'user',
  reputation integer not null default 0,
  is_suspended boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function lightdey.is_staff() returns boolean
language sql stable security definer set search_path = lightdey as $$
  select exists (select 1 from lightdey.users where id = auth.uid() and role in ('moderator', 'admin') and not is_suspended);
$$;

-- ---------- Reports ----------
create type lightdey.power_status as enum ('on', 'off');
create type lightdey.report_verification as enum ('unverified', 'location_matched', 'location_mismatch', 'flagged', 'removed');

create table lightdey.electricity_reports (
  id uuid primary key default gen_random_uuid(),
  neighbourhood_id text not null references lightdey.neighbourhoods(id) on delete restrict,
  status lightdey.power_status not null,
  user_id uuid references lightdey.users(id) on delete set null,   -- signed-in reporter
  reporter_key text not null check (char_length(reporter_key) between 8 and 64), -- anon cookie id or user id
  network_hash text not null check (char_length(network_hash) between 8 and 64), -- HMAC of IP, never raw IP
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  verification lightdey.report_verification not null default 'unverified',
  comment text check (char_length(comment) <= 140),
  created_at timestamptz not null default now(),
  check ((lat is null) = (lng is null))
);
create index electricity_reports_area_time_idx on lightdey.electricity_reports (neighbourhood_id, created_at desc);
create index electricity_reports_reporter_time_idx on lightdey.electricity_reports (reporter_key, created_at desc);
create index electricity_reports_network_time_idx on lightdey.electricity_reports (network_hash, created_at desc);
create index electricity_reports_time_idx on lightdey.electricity_reports (created_at desc);

-- Cached live status per area (written by the server; Phase 2 backlog LD-021).
create table lightdey.neighbourhood_status (
  neighbourhood_id text primary key references lightdey.neighbourhoods(id) on delete cascade,
  state text not null check (state in ('LIGHT', 'NO_LIGHT', 'UNCERTAIN', 'UNKNOWN')),
  on_reporters integer not null default 0,
  off_reporters integer not null default 0,
  recent_reports integer not null default 0,
  confidence text not null check (confidence in ('high', 'medium', 'low', 'none')),
  last_report_at timestamptz,
  computed_at timestamptz not null default now()
);

-- Confirmed status transitions (LIGHT <-> NO_LIGHT etc).
create table lightdey.status_history (
  id bigint generated always as identity primary key,
  neighbourhood_id text not null references lightdey.neighbourhoods(id) on delete cascade,
  from_state text,
  to_state text not null,
  changed_at timestamptz not null default now(),
  confirming_reporters integer not null default 0
);
create index status_history_area_time_idx on lightdey.status_history (neighbourhood_id, changed_at desc);

-- ---------- Engagement ----------
create table lightdey.user_follows (
  user_id uuid not null references lightdey.users(id) on delete cascade,
  neighbourhood_id text not null references lightdey.neighbourhoods(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, neighbourhood_id)
);

create table lightdey.notification_preferences (
  user_id uuid primary key references lightdey.users(id) on delete cascade,
  push_enabled boolean not null default false,
  email_enabled boolean not null default false,
  notify_light_on boolean not null default true,
  notify_light_off boolean not null default true,
  quiet_hours_start smallint check (quiet_hours_start between 0 and 23),
  quiet_hours_end smallint check (quiet_hours_end between 0 and 23),
  updated_at timestamptz not null default now()
);

create table lightdey.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references lightdey.users(id) on delete cascade,
  neighbourhood_id text references lightdey.neighbourhoods(id) on delete cascade,
  kind text not null check (kind in ('light_on', 'light_off', 'status_change')),
  channel text not null check (channel in ('push', 'email', 'whatsapp', 'in_app')),
  body text not null,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on lightdey.notifications (user_id, created_at desc);

-- ---------- Moderation ----------
create table lightdey.report_flags (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references lightdey.electricity_reports(id) on delete cascade,
  flagged_by text not null,                  -- reporter_key of the flagger
  reason text not null check (reason in ('false', 'spam', 'abuse', 'other')),
  created_at timestamptz not null default now(),
  unique (report_id, flagged_by)
);

create table lightdey.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  moderator_id uuid not null references lightdey.users(id) on delete restrict,
  target_type text not null check (target_type in ('report', 'user', 'neighbourhood')),
  target_id text not null,
  action text not null check (action in ('remove_report', 'restore_report', 'suspend_user', 'unsuspend_user', 'edit_neighbourhood')),
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);

-- ---------- Row Level Security ----------
alter table lightdey.states enable row level security;
alter table lightdey.cities enable row level security;
alter table lightdey.local_government_areas enable row level security;
alter table lightdey.neighbourhoods enable row level security;
alter table lightdey.users enable row level security;
alter table lightdey.electricity_reports enable row level security;
alter table lightdey.neighbourhood_status enable row level security;
alter table lightdey.status_history enable row level security;
alter table lightdey.user_follows enable row level security;
alter table lightdey.notification_preferences enable row level security;
alter table lightdey.notifications enable row level security;
alter table lightdey.report_flags enable row level security;
alter table lightdey.moderation_actions enable row level security;

-- Public reference + aggregate data: read-only for everyone.
create policy "public read" on lightdey.states for select using (true);
create policy "public read" on lightdey.cities for select using (true);
create policy "public read" on lightdey.local_government_areas for select using (true);
create policy "public read" on lightdey.neighbourhoods for select using (is_active);
create policy "public read" on lightdey.neighbourhood_status for select using (true);
create policy "public read" on lightdey.status_history for select using (true);

-- Users: see and edit only your own profile, and never your own role/reputation.
create policy "own profile read" on lightdey.users for select using (id = auth.uid() or lightdey.is_staff());
create policy "own profile update" on lightdey.users for update using (id = auth.uid()) with check (id = auth.uid());
-- Column-level grant: users can change their display name only, never role/reputation/suspension.
-- (If this schema is ever exposed: grant update (display_name) only.)

-- Reports: no direct inserts/updates/deletes with public keys (server only).
-- Signed-in users may read their own reports; staff may read all.
create policy "own reports read" on lightdey.electricity_reports for select using (user_id = auth.uid() or lightdey.is_staff());

create policy "own follows" on lightdey.user_follows for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own prefs" on lightdey.notification_preferences for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own notifications read" on lightdey.notifications for select using (user_id = auth.uid());
create policy "own notifications mark read" on lightdey.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "staff read flags" on lightdey.report_flags for select using (lightdey.is_staff());
create policy "staff read actions" on lightdey.moderation_actions for select using (lightdey.is_staff());

-- Defence in depth: public API roles get nothing on this schema's tables.
revoke all on all tables in schema lightdey from anon, authenticated;

-- No auth trigger here: the auth users table is shared with other apps in this
-- project. Light Dey profile rows are created on first Light Dey sign-in (LD-014).
