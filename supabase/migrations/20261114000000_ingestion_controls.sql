-- Ingestion controls (Qodo review of PR #3):
--  * sources.running_until: in-progress lock, so even forced runs never fetch a source concurrently.
--  * partner_keys.allowed_neighbourhoods: a key may only report for its approved areas.
--  * partner_key_writes: per-key write log for an atomic hourly quota.
set local search_path = lightdey, public;

alter table lightdey.sources add column if not exists running_until timestamptz;

alter table lightdey.partner_keys add column if not exists allowed_neighbourhoods text[] not null default '{}';

create table if not exists lightdey.partner_key_writes (
  id bigint generated always as identity primary key,
  key_id uuid not null references lightdey.partner_keys(id) on delete cascade,
  written_at timestamptz not null default now()
);
create index if not exists partner_key_writes_key_time_idx on lightdey.partner_key_writes (key_id, written_at desc);

alter table lightdey.partner_key_writes enable row level security;
revoke all on all tables in schema lightdey from anon, authenticated;
