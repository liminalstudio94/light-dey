# Architecture

## Overview

**Request flow:** pages (server components) and `/api/status` call `getOverview()`. It loads 24h of community reports, unexpired observations and this hour's patterns, runs `aggregateAreaStatus()` (community rules) and then `resolveAreaStatus()` (evidence engine) for every area. Clients poll `/api/status` every 30 s.

**Report flow:** `ReportPanel` → `POST /api/reports` → `submitReport()` (validation, duplicate, rate limits, location match) → `electricity_reports`.

**Ingestion flow:** GitHub Actions (every 10 min; the run fails if any source errors), a Vercel cron (daily backup) or an `after()` hook on `/api/status` → `refreshDueSources()` → adapters in parallel, each: DB lease with an in-progress lock (even forced runs can't overlap) → fetch with retries under a 30 s deadline → fail-closed parse → idempotent upsert into `observations` (all columns + area links reconciled) → run logged in `source_runs` → lease released. Then hourly `recomputePatterns()` and an atomic `recordSnapshotChanges()` (skipped on the opportunistic path unless a source ran). If evidence tables are missing, pages fall back to community-only status.

Next.js 15 (App Router, TypeScript, Tailwind v4) serves both UI and API. Supabase Postgres stores data in a dedicated `lightdey` schema. Business rules are pure TypeScript in `src/lib`, so they run identically in tests, API routes and server components.

```
Browser ──► Next.js route handlers (/api/*) ──► submitReport() rules ──► DataStore
   ▲              │                                                    ├─ PostgresStore (prod, POSTGRES_URL, server only)
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
**Hosting:** a Supabase project provisioned through the Vercel marketplace (`dropscope-db`), shared with another app because the free-tier project limit was reached. Isolation:
- All Light Dey objects live in the `lightdey` schema; nothing is created in `public`, and there is no trigger on the shared auth users table.
- The schema is not exposed through the Supabase Data API (PostgREST returns PGRST106), and `anon`/`authenticated` have no table grants.
- The app connects server-side with `POSTGRES_URL` (transaction pooler, `prepare: false`).
- Migrations: `npm run db:migrate` applies `supabase/migrations/*.sql` once each, tracked in `lightdey.schema_migrations`.
- Moving to a dedicated project later = run the same migrations there and change `POSTGRES_URL`.

See `supabase/migrations/`. 13 tables: states, cities, local_government_areas, neighbourhoods, users, electricity_reports, neighbourhood_status, status_history, user_follows, notification_preferences, notifications, report_flags, moderation_actions. RLS on all. Reports are not readable or writable with public keys; only the server writes, after running `submitReport()`. Coordinates are plain lat/lng columns; PostGIS is deferred until geo queries are needed (LD-031).

## Geography
41 Lagos neighbourhoods with **approximate centre points** (no boundaries). The map draws dots, labelled approximate. `neighbourhoods.boundary_geojson` is reserved for a future, sourced polygon dataset. Expansion to other states = new rows in states/cities/LGAs/neighbourhoods; no code change to the rules.

## Maps
Leaflet + OpenStreetMap standard tiles (attribution shown). OSM's tile policy suits low traffic only; before launch at scale, switch to a provider with an SLA (MapTiler/Stadia/Mapbox) — LD-028.

## Evidence

`src/lib/evidence.ts`, rules in `EVIDENCE_CONFIG` (`src/lib/config.ts`), sources in `src/lib/sources/registry.ts`. Full source notes: SOURCES.md.

| Map state | Requires | Marker |
|---|---|---|
| `CONFIRMED_OFF` / `CONFIRMED_ON` | Official (tier 1): grid collapse, mapped DisCo ≤ 5 MW, or official partner; or 2 verified reporters (or 1 + community) | solid, dark ring |
| `COMMUNITY_OFF` / `COMMUNITY_ON` | 3+ independent community reporters in 60 min (max 2 per network). A lone verified report stays `UNKNOWN` | solid |
| `CONFLICTING` | Opposing official, verified, or community evidence | yellow |
| `ESTIMATED_OFF` / `ESTIMATED_ON` | No fresh reports at all; ≥ 6 past confirmed hours at this hour, ≥ 70% one way | dashed hollow; legacy `state` stays `UNKNOWN` |
| `UNKNOWN` | Nothing above; explanation says why | grey |

Supersede: only the newest reading per source and measure (DisCo, national total, one partner's report for one area) is considered, so recoveries clear outages at once; future-dated readings are ignored. Grid outage status is derived from MW thresholds, not stored flags.

Expiry: official grid figures 90 min after their own "as at" (NISO publishes about hourly); partner reports 60 min; community 60 min; notices 14 days (context only). Observations with future timestamps are ignored. Every status carries `evidence[]` (source, tier, role, count, time, freshness, link) and an `explanation`.

**Not hard-coded:** no area has a fixed status. Yaba, for example, is unmapped to a DisCo, so only a national collapse, verified reporters or 3 independent neighbours can change it (see the Yaba tests in `tests/unit/evidence.test.ts`).

Tables (migration `20261113010000_evidence.sql`): `sources`, `source_runs`, `observations`, `observation_neighbourhoods`, `disco_service_areas`, `verification_events`, `partner_keys`, `status_snapshots`, `hourly_patterns`.
