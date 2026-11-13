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

### LD-009 — Database schema & RLS · P0 · done (not yet applied)
13 tables, PostGIS, RLS everywhere, seed generated from areas.ts. Tests: `security.test.ts` static checks. **Not yet run against a real database.**

## Todo
### LD-010 — Create Supabase project and apply migrations · P0 · blocked (credentials)
Acceptance: migrations apply cleanly; app reads/writes reports via SupabaseStore; RLS verified with the publishable key (anon cannot read reports or insert). Tests: integration test against a Supabase branch/local stack.

### LD-011 — Deploy to Vercel · P0 · depends LD-010
Env vars set (SUPABASE_URL, SUPABASE_SECRET_KEY, REPORTER_HASH_SECRET, NEXT_PUBLIC_SITE_URL). Acceptance: production smoke test of report → status.

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

### LD-030 — CI on GitHub Actions + Qodo review · P1
Run `npm run check` + build on PRs.
