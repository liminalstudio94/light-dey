-- Withdrawals are explicit: a withdrawn observation is excluded from every read, whatever its
-- timestamps (fixes future-dated claims that couldn't be withdrawn via valid_until = now()).
set local search_path = lightdey, public;
alter table lightdey.observations add column if not exists withdrawn_at timestamptz;
create index if not exists observations_live_idx on lightdey.observations (valid_until desc) where withdrawn_at is null;
