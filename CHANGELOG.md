# Changelog

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
