# Light Dey Sensor — protocol v1 & setup

A Light Dey Sensor is an **opt-in** device that detects whether **grid mains** is present at one point in a neighbourhood and sends a signed heartbeat. A recent heartbeat from a healthy sensor is *measured* evidence: it can mark an area **Confirmed** without anyone reporting manually.

**Status:** server side implemented and tested (`/api/sensors/heartbeat`, health, replay protection, rate limits). Reference client: `scripts/sensor/light_dey_sensor.py`. **No devices are deployed yet** — every area stays as other evidence allows until real hardware reports.

## What a reading means

| Field | Meaning |
|---|---|
| `mains` | Is **grid** voltage present at the sensor's input? `on` / `off` / `unknown` |
| `powerSource` | What the *device itself* runs on right now (`grid`, `ups`, `battery`, `generator`, `inverter`, `solar`). Never treated as grid evidence. |
| `supplyPoint` (set at provisioning) | `grid_direct` = wired to raw grid **before** any generator/inverter changeover; `after_changeover` = could be fed by a generator; `unknown` |

How the engine uses a fresh reading:

| Sensor | Reading | Result |
|---|---|---|
| healthy, `grid_direct` | on / off | **Confirmed** power / outage (measured) |
| degraded (late, clock off, low battery, self-test fail) | on / off | **Likely** |
| `after_changeover` / `unknown` | off | **Likely outage** (grid *and* generator are off) |
| `after_changeover` / `unknown` | on | context only — could be the generator |
| offline (silent > 15 min) | — | context only — **silence is never an outage** |

- Independent sensors = **different networks** (hashed IP of the last heartbeat). Two sensors on one Wi-Fi count once.
- Strong sensors that disagree ⇒ **Conflicting** (streets can be on different feeders).
- A sensor only affects **its own registered neighbourhood**.
- A UPS-powered sensor reporting `mains: off, powerSource: ups` is exactly the reading we want during an outage (no "the device has power" false positive).

## Protocol v1 (HTTP)

```
POST /api/sensors/heartbeat
Content-Type: application/json
X-LightDey-Signature: v1=<hex HMAC-SHA256(deviceSecret, rawBody)>

{"v":1,"deviceId":"ldd_…","ts":1794680000,"nonce":"<16–64 url-safe chars>",
 "mains":"off","powerSource":"ups","batteryPct":82,"uptimeS":86400,"firmware":"ref-py-1.0","selfTest":"pass"}
```

| Check | Rule | Response |
|---|---|---|
| Size | ≤ 2 KB | 413 |
| Schema | zod (above) | 400 |
| Device | exists, not revoked | 401 (generic) |
| Signature | `v1=` HMAC of the exact raw body, timing-safe compare | 401 (generic) |
| Clock | `ts` within ±300 s of server time | 401 `stale` |
| Replay | `(deviceId, nonce)` accepted once (kept ≥ 1 h) | 409 `replay` |
| Rate | ≥ 20 s between accepted heartbeats per device | 429 |
| OK | stored + device state updated atomically | **202** |

`deviceSecret = base64url(HMAC-SHA256(SENSOR_MASTER_SECRET, "lightdey-device:v1:" + deviceId))` — derived, never stored. Rotate a device by revoking it and provisioning a new id.

Recommended cadence: every 60 s; on mains loss send immediately (a "last gasp" from UPS power is the most useful heartbeat there is).

### MQTT (designed, not deployed)

Vercel functions can't hold MQTT connections, so MQTT is a **bridge**: devices publish to `lightdey/v1/<deviceId>/heartbeat` with the **same signed JSON payload**; a small bridge (any MQTT broker + a forwarder) POSTs each message unchanged to `/api/sensors/heartbeat`. Because the signature covers the body, the bridge needs no secrets and can't forge readings. Not built yet (LD-073).

## Privacy

- Device id is random (`ldd_…`). The server stores **neighbourhood only** — no owner, address or coordinates. Keep owner contact details outside this system.
- Network address is stored only as an HMAC (`network_hash`), used for independence and rate limiting.
- Raw heartbeats are pruned after 7 days; nonces after 1 hour. Public pages show only per-area counts (online / offline) — never device ids.

## Setup

1. Server: set `SENSOR_MASTER_SECRET` (≥ 32 random chars, `openssl rand -hex 32`) in Vercel and `.env.local`.
2. Provision: `npm run sensor:provision -- --area yaba --supply grid_direct` → prints `LIGHTDEY_DEVICE_ID` / `LIGHTDEY_DEVICE_SECRET` once.
3. Hardware (reference): Raspberry Pi on a UPS/power bank + an **opto-isolated mains-presence module** on a GPIO pin, connected by a qualified electrician to a grid-only socket (before the changeover). Never connect mains directly to a GPIO pin.
4. Run: `LIGHTDEY_DEVICE_ID=… LIGHTDEY_DEVICE_SECRET=… python3 scripts/sensor/light_dey_sensor.py --url https://<site> --gpio 17`
5. Revoke: `npm run sensor:provision -- --revoke ldd_…`

Bench testing: `--test-mains on|off` sends a fixed reading **only to localhost** — it cannot put invented readings on the live map.

## Third-party device providers

The adapter framework is the registry (`src/lib/sources/registry.ts`, kind `device_provider`). Candidates with documented APIs — **Victron VRM** (inverter AC-input state) and **Shelly Cloud** (smart plugs) — need the owner's token/consent and are **inactive and not claimed compatible** until tested with a real consenting installation (LD-074, LD-075). Device "online" status alone is never mains evidence (Wi-Fi and UPS).
