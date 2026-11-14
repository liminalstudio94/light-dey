-- Evidence model: sources, raw observations, ingestion runs, verification
-- events, partner keys, DisCo service areas, status snapshots and hourly
-- patterns. See SOURCES.md and ARCHITECTURE.md#evidence.
set local search_path = lightdey, public;

create table lightdey.sources (
  id text primary key,                                   -- matches src/lib/sources/registry.ts
  name text not null,
  kind text not null check (kind in ('official_grid', 'official_disco', 'regulator', 'verified_partner', 'verified_reporter', 'community', 'estimate')),
  trust_tier smallint not null check (trust_tier between 1 and 4), -- 1 official, 2 verified, 3 community, 4 estimate
  coverage text not null,
  url text,
  credentials_required boolean not null default false,
  refresh_interval_minutes integer check (refresh_interval_minutes > 0),
  is_active boolean not null default false,
  notes text,
  last_attempt_at timestamptz,                           -- lease for rate limiting
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create table lightdey.source_runs (
  id bigint generated always as identity primary key,
  source_id text not null references lightdey.sources(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('running', 'ok', 'error', 'skipped')),
  attempts smallint not null default 0,
  items_fetched integer not null default 0,
  items_written integer not null default 0,
  error text,
  log jsonb not null default '[]'
);
create index source_runs_source_time_idx on lightdey.source_runs (source_id, started_at desc);

-- Raw, attributable observations from non-community sources. Idempotent on (source_id, external_id).
create table lightdey.observations (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references lightdey.sources(id) on delete restrict,
  external_id text not null,
  scope text not null check (scope in ('national', 'disco', 'neighbourhood')),
  scope_ref text,                                        -- disco id or neighbourhood id
  kind text not null check (kind in ('grid_total', 'disco_allocation', 'notice', 'status_report')),
  status lightdey.power_status,                          -- null = context only, never a status claim
  value_num double precision,
  title text,
  url text,
  observed_at timestamptz not null,
  valid_until timestamptz not null,
  fetched_at timestamptz not null default now(),
  payload jsonb not null default '{}',
  unique (source_id, external_id),
  check (valid_until >= observed_at),
  check ((scope = 'national') = (scope_ref is null))
);
create index observations_valid_idx on lightdey.observations (valid_until desc);
create index observations_scope_idx on lightdey.observations (scope, scope_ref, observed_at desc);

create table lightdey.observation_neighbourhoods (
  observation_id uuid not null references lightdey.observations(id) on delete cascade,
  neighbourhood_id text not null references lightdey.neighbourhoods(id) on delete cascade,
  primary key (observation_id, neighbourhood_id)
);

-- Neighbourhood -> DisCo, only where an official source names it. Unmapped areas never inherit DisCo-level evidence.
create table lightdey.disco_service_areas (
  neighbourhood_id text primary key references lightdey.neighbourhoods(id) on delete cascade,
  disco_id text not null check (disco_id in ('eko', 'ikeja')),
  basis text not null,
  source_url text not null,
  verified_at date not null
);

create table lightdey.verification_events (
  id bigint generated always as identity primary key,
  report_id uuid references lightdey.electricity_reports(id) on delete cascade,
  observation_id uuid references lightdey.observations(id) on delete cascade,
  event text not null check (event in ('flagged', 'removed', 'restored', 'verified', 'partner_ingested', 'source_disabled')),
  actor text not null,
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  check (report_id is not null or observation_id is not null)
);

-- API keys for approved partners / verified reporters. Only a SHA-256 hash is stored.
create table lightdey.partner_keys (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references lightdey.sources(id) on delete cascade,
  key_hash text not null unique check (char_length(key_hash) = 64),
  label text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- Point-in-time map states, written when an area's state changes.
create table lightdey.status_snapshots (
  id bigint generated always as identity primary key,
  neighbourhood_id text not null references lightdey.neighbourhoods(id) on delete cascade,
  map_state text not null check (map_state in ('CONFIRMED_ON', 'CONFIRMED_OFF', 'COMMUNITY_ON', 'COMMUNITY_OFF', 'CONFLICTING', 'ESTIMATED_ON', 'ESTIMATED_OFF', 'UNKNOWN')),
  confidence text not null,
  freshness text not null,
  evidence jsonb not null default '[]',                  -- attribution at that moment
  computed_at timestamptz not null default now()
);
create index status_snapshots_area_time_idx on lightdey.status_snapshots (neighbourhood_id, computed_at desc);

-- Hour-of-day pattern from confirmed community history (for clearly-labelled estimates).
create table lightdey.hourly_patterns (
  neighbourhood_id text not null references lightdey.neighbourhoods(id) on delete cascade,
  hour smallint not null check (hour between 0 and 23),
  light_hours integer not null default 0,
  known_hours integer not null default 0,
  window_days smallint not null,
  computed_at timestamptz not null default now(),
  primary key (neighbourhood_id, hour)
);

alter table lightdey.sources enable row level security;
alter table lightdey.source_runs enable row level security;
alter table lightdey.observations enable row level security;
alter table lightdey.observation_neighbourhoods enable row level security;
alter table lightdey.disco_service_areas enable row level security;
alter table lightdey.verification_events enable row level security;
alter table lightdey.partner_keys enable row level security;
alter table lightdey.status_snapshots enable row level security;
alter table lightdey.hourly_patterns enable row level security;
revoke all on all tables in schema lightdey from anon, authenticated;
