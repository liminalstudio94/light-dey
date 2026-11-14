-- Heartbeats must arrive in device-time order: a delayed or held-back older reading can never
-- overwrite a newer one (e.g. through a relay/MQTT bridge).
set local search_path = lightdey, public;
alter table lightdey.devices add column if not exists last_device_ts timestamptz;
