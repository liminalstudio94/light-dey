# Backlog

Format and Definition of Done: see AGENTS.md §12–13. Priorities: P0 = needed for launch, P1 = soon after, P2 = later.

## Done
### LD-001 — Project foundation · P0 · done
Next.js 15 + TS strict + Tailwind v4 + ESLint + Vitest. Acceptance: `npm run check` and `npm run build` pass. Tests: all suites.

### LD-002 — Design system & layout · P0 · done
Tokens in globals.css, Logo, header, footer, status badge/dot. Acceptance: no horizontal scroll at 390px. Tests: browser check (phone + desktop).

### LD-003 — Neighbourhood reference data & search · P0 · done
41 Lagos areas (approximate centres), ranked autocomplete with aliases, accessible combobox. Tests: `search.test.ts`, browser check.

### LD-004 — Report submission with server validation · P0 · done
`POST /api/reports`, zod validation, duplicate (10 min), per-reporter + per-network rate limits, honeypot, same-origin, link ban, location match. Tests: `reports.test.ts`, API curl check.

### LD-005 — Status aggregation · P0 · done
3-distinct-reporter confirmation, conflicts ⇒ UNCERTAIN, stale ⇒ UNKNOWN, per-network cap, confidence + freshness. Tests: `status.test.ts`.

### LD-006 — Homepage live dashboard · P0 · done
Hero + search, overview counts, map/list with filters, popular, recent reports, how it works, community stats, CTA. Polls every 30s.

### LD-007 — Interactive map · P0 · done
Leaflet + OSM, coloured markers, popups, filters, map/list toggle, labelled approximate.

### LD-008 — Area pages, history, best hours, share · P0 · done
`/area/[id]`: live status with all fields, report panel, share (WhatsApp/X/Facebook/copy), nearby comparison, 7/30-day history charts, best hours as estimates. Tests: `history.test.ts`, `components.test.tsx`.

### LD-009 — Database schema & RLS · P0 · done
13 tables in `lightdey` schema, RLS everywhere, seed generated from areas.ts. Tests: `security.test.ts` static checks.

### LD-010 — Connect Supabase and apply migrations · P0 · done (PR #1)
Supabase via Vercel marketplace (shared `dropscope-db`, isolated `lightdey` schema), PostgresStore, `npm run db:migrate`. Verified: 14 tables with RLS, 41 areas seeded, Data API rejects the schema, anon/authenticated have 0 grants, API + browser checks pass against the real DB (test rows deleted).

### LD-011 — Deploy to Vercel · P0 · done (PR #1)
REPORTER_HASH_SECRET set; production smoke test of report → status.

### LD-040 — Evidence model & engine · P0 · done (PR #2)
### LD-041 — Source adapters (NISO, Ikeja Electric) & scheduled refresh · P0 · done (PR #3)
### LD-042 — Partner / verified-reporter ingestion API · P0 · done (PR #3)
### LD-043 — Evidence UI: map states, attribution, grid card, /sources, confirm prompt · P0 · done (PR #4)
### LD-045 — CI + Qodo config · P0 · done (PR #3)

### LD-070 — Evidence engine v2 + Light Dey Sensor telemetry · P0 · done (PR #5)
### LD-071 — UI v2: likely/measured labels, sensor coverage, timeline, help-confirm, /sensors · P0 · done (PR #6)

## Next — sensors & partners (implementation order, one PR each)
### LD-072 — Sensor pilot: 3 hosts in Yaba, Ikeja, Lekki · P0 · needs hardware + hosts
Provision with `npm run sensor:provision`, electrician-installed opto-isolated mains module on a grid-only socket, Pi on UPS. Acceptance: each area shows "Confirmed" with measured evidence while online; pulling the module's mains shows "Confirmed outage" within 2 min; unplugging the Pi shows "offline" (not outage) after 15 min. Tests: field log in PR.

### LD-073 — MQTT bridge · P2 · depends LD-072
Broker + forwarder that POSTs signed payloads unchanged to `/api/sensors/heartbeat`. Acceptance: bridge holds no secrets; replay/rate rules still enforced server-side.

### LD-074 — Victron VRM adapter · P1 · needs a consenting installation
Map VRM AC-input state to a reading only for installs confirmed grid-direct. Acceptance: tested against a real installation before the registry says "live".

### LD-075 — Shelly Cloud adapter · P2 · needs a consenting device with voltage reporting
Acceptance: device online/offline never used as mains evidence; only measured voltage on a grid-only circuit.

### LD-076 — Sensor health dashboard (staff only) · P1 · depends LD-017
Online/offline/degraded per device, clock skew, last gasp; alerts when a pilot device goes silent.

### LD-077 — IODA permission · P2
Email IODA's data contact; on written permission set `SOURCE_IODA_ENABLED=1` and record it in the registry notes.

### LD-078 — First verified partners (security desks, shops) · P1
Issue `partner:` keys (tier 2) with `--areas`; onboarding guide.

## Next — evidence (in implementation order, one PR each)
### LD-046 — Turn on the 10-minute schedule · P0 · needs repo secrets
Set GitHub secrets `LIGHTDEY_URL` + `CRON_SECRET` (same as Vercel). Acceptance: `source_runs` shows `niso_niggrid` ok at least every 15 min for 24h. Tests: n/a (ops); verify via SQL.

### LD-047 — Source health on /sources · P1 · depends LD-046
Show last success/error per source from `source_runs`; badge a source "stale" when it has no success in 3× its interval. Acceptance: a disabled source shows stale within 30 min. Tests: health calculation unit test.

### LD-048 — First verified reporters pilot (Yaba, Ikeja, Lekki) · P1
Process doc + issue keys to 2–3 vetted reporters per area. Acceptance: `CONFIRMED_*` appears only when 2 agree. Tests: existing engine tests; add an end-to-end partner API → status test against Postgres (LD-033).

### LD-049 — Expand official DisCo mapping · P1
Use NERC energy-cap PDFs (feeders per district/business unit) to map more areas, each with a citation. Acceptance: every new mapping has a source URL and a test; no mapping by guesswork. Tests: registry tests.

### LD-050 — DisCo partner outreach (Eko, Ikeja) · P1
Request a machine-readable outage/restoration feed. On approval: a tier-1 partner key or a new adapter. Acceptance: signed approval recorded in registry notes.

### LD-051 — Flag a report from the evidence panel · P1 · depends LD-016
### LD-052 — Notices: OCR-free matching of feeder names to areas · P2 · depends LD-049
### LD-053 — Include official outages in history charts · P2

## Todo
### LD-031 — PostGIS + sourced boundaries · P2
Enable PostGIS (ideally on a dedicated project), migrate lat/lng to geography, nearest-area queries in SQL.

### LD-032 — Dedicated Supabase project · P1
Move off the shared database before real launch traffic (same migrations, new POSTGRES_URL).

### LD-033 — Automated DB integration test · P1
Run the API checks against a throwaway Postgres in CI.

### LD-012 — Durable rate limiting · P0 · depends LD-010
Limits are DB-backed already; add a Postgres function doing check+insert atomically to avoid race-condition double inserts. Tests: concurrent submit test.

### LD-013 — CAPTCHA (Cloudflare Turnstile) on suspicious traffic · P1
Show challenge after N reports or for flagged networks. Tests: route rejects missing/invalid token when required.

### LD-014 — Supabase Auth (Google + email magic link) · P1 · depends LD-010
Optional sign-in; signed-in reports carry `user_id`. Tests: auth callback, RLS own-reports read.

### LD-015 — Reputation & suspicious-activity detection · P1 · depends LD-014
Score reporters by agreement with later confirmed state; weight counts; flag networks with abnormal patterns. Tests: scoring unit tests.

### LD-016 — Report flagging · P1
Users flag a report (false/spam/abuse); N flags ⇒ `flagged` (excluded from status). Tests: flag API, aggregation excludes.

### LD-017 — Admin dashboard · P1 · depends LD-014
`/admin` guarded server-side by `is_staff()`: totals, activity, suspicious reports, remove report, suspend user, edit areas, errors. Tests: unauthorized ⇒ 403/redirect for every admin route and action.

### LD-018 — Follow areas · P1 · depends LD-014
Follow/unfollow; anonymous follows in localStorage until sign-in. Tests: RLS own follows.

### LD-019 — Push + email notifications on confirmed changes · P1 · depends LD-018, LD-021
Web Push (VAPID) + email (Resend). Only on confirmed LIGHT↔NO_LIGHT transitions; respects preferences and quiet hours. Tests: never sends on single report; preference filtering.

### LD-020 — Playwright E2E suite · P1
Port the headless browser checks (search, report, map, filters, mobile layout) to Playwright in CI. Keep it short.

### LD-021 — Status transition job · P1 · depends LD-010
Scheduled job (Vercel Cron, every 5 min) computes statuses, upserts `neighbourhood_status`, appends `status_history` transitions. Tests: transition detection.

### LD-022 — History from status_history · P2 · depends LD-021
Replace raw replay for 30-day history to scale.

### LD-023 — Shareable OG images · P2
Dynamic `opengraph-image` per area showing status + time.

### LD-024 — Offline-friendly PWA · P2
Manifest, service worker caching shell + last overview, “last updated” banner when offline.

### LD-025 — Privacy-conscious analytics · P2
DAU/WAU, reports/area, confirmation time, flagged %, coverage, top searches — aggregated, no personal data.

### LD-026 — Lazy-load charts · P2
Area page first-load JS is 234 kB (Recharts). Load the history section on scroll.

### LD-027 — WhatsApp bot (reports + queries) · P2

### LD-028 — Map tile provider with SLA · P1 before launch
OSM standard tiles are for light use only.

### LD-029 — Expand neighbourhood coverage & verify coordinates · P1
Review each centre point against OSM; add more areas; add sourced boundaries where available.

### LD-030 — CI on GitHub Actions + Qodo review · done (see LD-045)
