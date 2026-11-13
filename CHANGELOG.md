# Changelog

## [Unreleased] — evidence engine (LD-040)
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
