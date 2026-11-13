# Architecture

## Overview
Next.js 15 (App Router, TypeScript, Tailwind v4) serves both UI and API. Supabase Postgres (+PostGIS) stores data. Business rules are pure TypeScript in `src/lib`, so they run identically in tests, API routes and server components.

```
Browser ──► Next.js route handlers (/api/*) ──► submitReport() rules ──► DataStore
   ▲              │                                                    ├─ SupabaseStore (prod, secret key, server only)
   │              └─► getOverview()/getAreaHistory() ─► status.ts /     └─ MemoryStore (dev/tests, starts empty)
   └── polls /api/status every 30s (paused when tab hidden)   history.ts
```

## Status rules
Implemented in `src/lib/status.ts`, configured in `src/lib/config.ts`.

| Setting | Default |
|---|---|
| Reporting window | 60 min |
| Confirmation threshold | 3 distinct reporters |
| Max counted reporters per network | 2 |
| Freshness | fresh ≤15, recent ≤30, ageing ≤60, stale >60 min |
| Duplicate window | 10 min (same reporter, area, status) |
| Rate limit | 6 reports / reporter / 10 min; 30 / network / 10 min |
| Location match | GPS within 3 km of area centre |

Algorithm for one area at time `now`:
1. Drop removed/flagged reports and anything outside the window.
2. Keep each reporter's latest report.
3. Newest first, count at most 2 reporters per hashed network.
4. ≥3 “on” ⇒ LIGHT, ≥3 “off” ⇒ NO_LIGHT. If both, the side that reached 3 most recently wins (power changed).
5. Both sides present, neither confirmed ⇒ UNCERTAIN. Otherwise ⇒ UNKNOWN (with a `leaning` hint).
6. Confidence: high (≥5 agreeing, newest ≤15 min, <20% dissent), medium (newest ≤30 min, majority), else low.

**Consequence:** a confirmed status expires after an hour without new reports. This is deliberate — we never carry a status forward without fresh evidence.

## History
`src/lib/history.ts` replays the live rule every 10 minutes over the past 7/30 days using only reports that existed at each moment. An hour is LIGHT/NO_LIGHT if confirmed at any check in it (majority if both), else UNKNOWN. Stats (availability, outages, avg outage length, by-hour, by-weekday, best/worst hours) are computed from those hours. Coverage % is always shown; reliability score = availability × min(1, coverage/50%).

Scaling plan (LD-021/LD-031): persist transitions to `status_history` via a scheduled job and read history from there instead of replaying raw reports.

## Identity & anti-abuse
- Anonymous reporter id: random UUID in an httpOnly cookie `ld_rid`.
- Network hash: HMAC-SHA256(IP, `REPORTER_HASH_SECRET`), truncated. Raw IPs are never stored.
- Honeypot field, same-origin check on POST, comment length + link ban.
- Known gap: cookie rotation lets one person look like several; the per-network cap limits this. CAPTCHA (Turnstile) and reputation are backlog items.

## Database
See `supabase/migrations/`. 13 tables: states, cities, local_government_areas, neighbourhoods, users, electricity_reports, neighbourhood_status, status_history, user_follows, notification_preferences, notifications, report_flags, moderation_actions. RLS on all. Reports are not readable or writable with public keys; the server uses the secret key after running `submitReport()`.

## Geography
41 Lagos neighbourhoods with **approximate centre points** (no boundaries). The map draws dots, labelled approximate. `neighbourhoods.boundary` is reserved for a future, sourced polygon dataset. Expansion to other states = new rows in states/cities/LGAs/neighbourhoods; no code change to the rules.

## Maps
Leaflet + OpenStreetMap standard tiles (attribution shown). OSM's tile policy suits low traffic only; before launch at scale, switch to a provider with an SLA (MapTiler/Stadia/Mapbox) — LD-028.
