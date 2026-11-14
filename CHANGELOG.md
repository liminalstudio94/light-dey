# Changelog

## [Unreleased] — evidence UI (LD-043)
### Fixed (Qodo review of PR #4)
- "Source" links only for https URLs on trusted official hosts; off-site RSS links are never stored.
- Unknown tile counts only Unknown areas; estimates listed separately.
- MW figures formatted with a fixed locale (no hydration mismatch).
- Share text: community → "reported" (never "confirmed"); grid outages → "grid supply outage" with the generator/solar caveat; verified confirmations name a safe label.
- Area page: agreement counted against the shown status; conflicting areas get a "sources disagree" prompt; "Latest evidence" uses official/verified times too; working "Report now" link at every breakpoint.
- Thresholds in all user copy come from config.
- The map filter can't hide the last populated state.
### Added
- Eight explicit map states with marker styles (confirmed ring, reported, dashed estimate, grey unknown), legend, per-state filters.
- "Where this comes from" attribution on area pages; Unknown explains why and asks to confirm; NISO grid card on the homepage; `/sources` page.
### Fixed
- Production pages hung: postgres.js pipelined queries through the Supabase transaction pooler and wedged the pool when the area page loaded the overview twice. Set `max_pipeline: 1` and cache `getOverview` per request.
- Share buttons caused a hydration mismatch (URL built from `window` during render).
- Share text never upgrades reported → confirmed or estimate → live.

## [Unreleased] — ingestion (LD-041)
### Fixed (Qodo pass 5)
- Withdrawals use an explicit `withdrawn_at` (migration 20261114000100), so future-dated claims can always be withdrawn.
- `--deactivate` revokes every key of the partner; re-approval needs `--reactivate` and old keys stay revoked.
- `--revoke` withdraws only claims the key was the latest to write.
- Partner key SQL lives in scripts/partner-ops.mjs and is tested against an empty Postgres (PGlite).
### Fixed (Qodo review of PR #3)
- Recoveries clear outages immediately (newest reading supersedes; sequence test).
- NIGGRID parser requires exactly one Total row matching the DisCo sum, and rejects duplicate rows.
- RSS parser rejects truncated/malformed feeds; ambiguous shared aliases (e.g. "lekki") no longer link areas.
- Partner keys: per-key approved areas (403 outside), externalId bound to its first area (409), atomic per-key hourly quota (`partner_key_writes`).
- Source runs hold an in-progress lock even when forced; adapters run in parallel with an overall deadline.
- Snapshots are compared and inserted atomically; the opportunistic refresh skips overview/snapshots unless a source ran.
- The scheduled workflow fails when any source errors.
- Migration `20261114000000_ingestion_controls.sql`.
### Added
- Adapters for the two verified public sources: NISO NIGGRID DisCo load profile (10 min) and Ikeja Electric notices RSS (hourly), with strict parsers that fail closed.
- Job runner: per-source leases (rate limit), retries with backoff, run logs in `source_runs`, kill switches, idempotent upserts.
- `/api/cron/refresh` (CRON_SECRET), opportunistic refresh after `/api/status`, GitHub Actions schedule every 10 min, daily Vercel cron backup.
- Hour-of-day pattern job and status snapshots on change.
- Partner/verified-reporter ingestion API `POST /api/ingest/observations` (hashed keys, validation, hourly limit) and `npm run partner:key`.
- CI workflow and Qodo config.

## [Unreleased] — evidence engine (LD-040)
### Fixed (Qodo review of PR #2)
- Newest reading per source/measure supersedes older ones, so recoveries clear outages immediately; future-dated readings can't supersede.
- Grid outage status is derived from the MW value and thresholds, never trusted from a stored flag; grid data never asserts light.
- A lone verified report shows as Unknown with the reason, not as an established status.
- Estimates only when an area has no fresh reports at all.
- Official max age 45 → 90 min (NISO publishes about hourly).
- Notices attach only to the areas they name.
- Partner / verified-reporter ids never reach the public API or UI.
- `listObservations` has no global row cap (latest per measure + active notices).
- Upserts detect changes in every mutable column and always reconcile area links.
- Pages keep serving community-only status if the evidence tables are missing.
### Added
- Evidence model migration: sources, source_runs, observations (+ neighbourhood links), disco_service_areas, verification_events, partner_keys, status_snapshots, hourly_patterns — all in `lightdey`, RLS on.
- Source registry (`src/lib/sources/registry.ts`) and official-only DisCo mapping (`src/lib/sources/discos.ts`), seeded by `npm run gen:seed`.
- Evidence engine (`src/lib/evidence.ts`): official > verified > community > estimate > unknown, with freshness expiry, dedupe and attribution. New `mapState` on every area status.
- Seed migrations re-apply when their content changes.

## [0.2.0] — 2026-11-13
### Added
- Supabase Postgres persistence (`PostgresStore`) in an isolated `lightdey` schema; migration runner `npm run db:migrate`.
- Vercel deployment.
### Changed
- Schema moved from `public` to `lightdey`; PostGIS deferred (lat/lng columns); no auth.users trigger.
### Removed
- `@supabase/supabase-js` (unused until auth lands).

## [0.1.0] — 2026-11-13
### Added
- Next.js 15 project with TypeScript strict, Tailwind v4, ESLint, Vitest.
- Homepage: hero search, live Lagos overview, map/list explorer with filters, popular areas, recent reports, how-it-works, community stats, CTA, footer.
- Neighbourhood search with autocomplete (41 Lagos areas, approximate centres).
- Reporting: LIGHT DEY / NO LIGHT, optional location, optional note; server-side validation, duplicate window, rate limits, honeypot, same-origin check.
- Status aggregation: 3-reporter confirmation, conflicts, staleness, freshness, confidence, per-network cap.
- Area pages: live status, share (WhatsApp/X/Facebook/copy), nearby comparison, 7/30-day history, charts, best hours (estimates).
- Supabase schema (13 tables, RLS, PostGIS) + generated Lagos seed.
- Docs: AGENTS, ARCHITECTURE, ROADMAP, BACKLOG, TESTING, SECURITY, CONTRIBUTING.
- 65 unit/component/security tests.
