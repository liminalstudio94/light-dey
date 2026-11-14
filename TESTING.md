# Testing

```bash
npm run check      # typecheck + lint + unit tests (~5s)
npm run build      # production build
```

## Suites (tests/unit)
| File | Covers |
|---|---|
| status.test.ts | Confirmation threshold, single report not confirming, conflicts ⇒ UNCERTAIN, stale ⇒ UNKNOWN, one-vote-per-reporter, network cap, removed/flagged ignored, confidence, freshness bands |
| reports.test.ts | Valid report accepted, invalid input rejected (9 cases), duplicate window, opposite status allowed, per-reporter + per-network rate limits, location match |
| history.test.ts | No invented history, light period then outage derived from real reports |
| search.test.ts | All headline areas findable, prefixes/aliases, unique slugs |
| components.test.tsx | Status badge labels, area card fields, unconfirmed explanation, share text includes time + confidence |
| evidence.test.ts | Evidence engine: official precedence and expiry, future/expired observations, DisCo scoping, context-only allocations/notices, official vs community conflict, verified-reporter rules and dedupe, estimates, grid context, **Yaba scenarios** |
| ingest.test.ts | NISO parser on a real page fixture (Lagos time, Total row, fail-closed on layout change, sum cross-check), outage vs context semantics, Ikeja RSS parsing and name-only matching, retries/backoff, leases, failures write nothing, kill switch, idempotency, snapshots, partner API auth/validation/idempotency, cron auth |
| sensors.test.ts | Measured confirm, independence by network, UPS outage, generator false positive, after-changeover ⇒ likely, degraded ⇒ likely, silence ⇒ not an outage, conflicting sensors, official vs sensor, geographic scope, estimate suppression, IODA context-only, **Yaba** (sensor ⇒ Confirmed at once; weak ⇒ Likely; conflicting), device health, signed heartbeat protocol (signature, unknown/revoked, replay, rate, stale, size, schema), end-to-end API, IODA parser + opt-in, timeline |
| integration.test.ts | Real route handlers + store + engine: report flow to COMMUNITY_OFF, duplicate/cross-origin, official observations through `/api/status`, idempotent upserts |
| security.test.ts | No secrets in client components, server-only guards, no hardcoded keys, RLS on all 13 tables, no public write policy on reports, seed in sync |

## Manual / browser checks (until LD-020 Playwright)
Headless Chrome at 390×844 and 1366×900: no horizontal scroll, 41 map markers, list/filter toggles, search → area page, history loads, report submit → thanks, duplicate tap → polite message, no console errors.

## CI
`.github/workflows/ci.yml` runs typecheck, lint, tests, a seed-sync check (`gen:seed` must not change files) and a build on every PR.

## Not yet covered
- Automated integration tests against real Postgres (LD-033). Manual DB checks are recorded in PRs.
- Auth/admin authorization (features not built yet)
- Notifications (not built yet)
