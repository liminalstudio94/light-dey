-- Light Dey Sensor telemetry + evidence model v2. See SENSORS.md.
-- Privacy: devices carry an anonymised id and a neighbourhood only — no household identity,
-- no address, no precise coordinates. Raw IPs are never stored (network_hash is an HMAC).
set local search_path = lightdey, public;

create table if not exists lightdey.devices (
  id text primary key check (id ~ '^ldd_[A-Za-z0-9]{16,40}$'),
  neighbourhood_id text not null references lightdey.neighbourhoods(id) on delete restrict,
  provider text not null default 'light_dey_v1',
  supply_point text not null check (supply_point in ('grid_direct', 'after_changeover', 'unknown')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  -- latest accepted heartbeat (denormalised for fast reads)
  last_heartbeat_at timestamptz,
  last_mains text check (last_mains in ('on', 'off', 'unknown')),
  last_power_source text check (last_power_source in ('grid', 'generator', 'inverter', 'solar', 'ups', 'battery', 'unknown')),
  last_battery_pct real check (last_battery_pct between 0 and 100),
  last_clock_skew_s integer,
  last_self_test text check (last_self_test in ('pass', 'fail')),
  last_firmware text check (char_length(last_firmware) <= 32),
  last_network_hash text check (char_length(last_network_hash) <= 64)
);
create index if not exists devices_area_idx on lightdey.devices (neighbourhood_id) where revoked_at is null;

create table if not exists lightdey.sensor_heartbeats (
  id bigint generated always as identity primary key,
  device_id text not null references lightdey.devices(id) on delete cascade,
  received_at timestamptz not null default now(),
  device_ts timestamptz not null,
  mains text not null check (mains in ('on', 'off', 'unknown')),
  power_source text not null,
  battery_pct real,
  self_test text,
  firmware text,
  network_hash text not null
);
create index if not exists sensor_heartbeats_device_time_idx on lightdey.sensor_heartbeats (device_id, received_at desc);

-- Replay protection: a (device, nonce) pair is accepted once.
create table if not exists lightdey.sensor_nonces (
  device_id text not null references lightdey.devices(id) on delete cascade,
  nonce text not null,
  seen_at timestamptz not null default now(),
  primary key (device_id, nonce)
);
create index if not exists sensor_nonces_seen_idx on lightdey.sensor_nonces (seen_at);

-- Evidence model v2: new map states, source kinds and observation kinds.
alter table lightdey.status_snapshots drop constraint if exists status_snapshots_map_state_check;
alter table lightdey.status_snapshots add constraint status_snapshots_map_state_check
  check (map_state in ('CONFIRMED_ON', 'CONFIRMED_OFF', 'LIKELY_ON', 'LIKELY_OFF', 'COMMUNITY_ON', 'COMMUNITY_OFF', 'CONFLICTING', 'ESTIMATED_ON', 'ESTIMATED_OFF', 'UNKNOWN'));
alter table lightdey.sources drop constraint if exists sources_kind_check;
alter table lightdey.sources add constraint sources_kind_check
  check (kind in ('official_grid', 'official_disco', 'regulator', 'verified_partner', 'verified_reporter', 'community', 'estimate', 'telemetry', 'proxy', 'device_provider'));
alter table lightdey.observations drop constraint if exists observations_kind_check;
alter table lightdey.observations add constraint observations_kind_check
  check (kind in ('grid_total', 'disco_allocation', 'notice', 'status_report', 'connectivity'));
-- Verified partners are human reporters (tier 2) from now on; only official DisCo partners keep tier 1.
update lightdey.sources set trust_tier = 2 where kind = 'verified_partner' and trust_tier = 1;

alter table lightdey.devices enable row level security;
alter table lightdey.sensor_heartbeats enable row level security;
alter table lightdey.sensor_nonces enable row level security;
revoke all on all tables in schema lightdey from anon, authenticated;
