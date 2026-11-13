# AGENTS.md — permanent engineering rules for Light Dey?

Read this before any change. These rules apply to humans and AI agents alike.

## 1. Product principles (non-negotiable)
1. **Truthfulness.** Never invent, seed, or simulate electricity data in production code paths. Demo data, if ever needed, lives behind an explicit flag and is labelled on screen.
2. **Transparency.** Every status shows report count, confirming users, last report time, freshness and confidence. Predictions are labelled “estimate”.
3. **Community, not official.** Never imply data comes from a DisCo or government.
4. **Stale is not live.** Reports outside the reporting window never drive a live status.
5. **Mobile first, low data.** Test at 390px. Avoid heavy dependencies on the main path.

## 2. Folder structure
```
src/app/                 Routes (App Router). Pages are thin: fetch + compose.
src/app/api/             Route handlers. Validate input, call services, map errors to HTTP.
src/components/          React components. "use client" only when needed.
src/lib/                 Pure business logic — framework-free, fully unit-tested.
  config.ts              ALL thresholds and windows. Never hardcode a rule elsewhere.
  status.ts              Live status aggregation (the core rule).
  history.ts             History/best-hours derived from stored reports.
  reports.ts             submitReport(): the only way to create a report.
  validation.ts          zod schemas for external input.
  areas.ts               Neighbourhood reference data (approximate centres).
  store/                 Persistence boundary (DataStore interface: memory | supabase).
  server/                Server-only helpers (identity, data loaders). Import "server-only".
supabase/migrations/     SQL migrations, timestamped, append-only.
tests/unit/              Vitest unit/component/security tests.
scripts/                 Dev scripts (e.g. gen-seed.ts).
```

## 3. TypeScript
- `strict` stays on. No `any`; use `unknown` + zod at boundaries.
- Domain types live in `src/lib/types.ts`. Client code imports types from there, never from `lib/server` or `lib/store`.
- Prefer pure functions taking `now: Date` so time-based rules are testable.

## 4. React
- Server Components by default; add `"use client"` only for interactivity.
- One component per file, PascalCase filename = export name.
- Accessible by default: labels for inputs, `aria-pressed`/`aria-selected` on toggles, live regions for async messages, visible focus, 44px touch targets.
- Status colour is never the only signal — always pair with a text label.
- Status colours (green/red/yellow/grey) are reserved for status. Brand accent is `brand` blue.

## 5. Naming
- Files: `PascalCase.tsx` for components, `camelCase.ts` for modules.
- Neighbourhood ids are stable kebab-case slugs. Never rename an id once shipped.
- DB: `snake_case` tables/columns, plural table names.

## 6. Database
- Every schema change is a new file in `supabase/migrations/` (`YYYYMMDDHHMMSS_name.sql`). Never edit a shipped migration.
- Every table has RLS enabled. Public keys get read-only access to reference/aggregate data only.
- Reports are written only by the server (PostgresStore), after `submitReport()` rules run.
- Everything goes in the `lightdey` schema — the database is shared. Never create objects in `public` or touch `auth` (a test enforces this).
- Apply migrations with `npm run db:migrate`.
- Changing `src/lib/areas.ts` ⇒ run `npm run gen:seed` and commit the regenerated seed (a test enforces sync).

## 7. Security
- Never expose `POSTGRES_URL*` or `REPORTER_HASH_SECRET` to the browser (no `NEXT_PUBLIC_` prefix; files importing them use `import "server-only"`).
- Validate every external input with zod on the server. Frontend validation is UX only.
- Admin/moderator checks happen server-side (`is_staff()` in SQL and in route handlers). Hiding a button is not authorization.
- Store hashes, not raw IPs. Collect location only on explicit user action.
- GPS is a signal, never proof of presence.

## 8. Error handling
- Route handlers return `{ error, code }` JSON with a correct status (400 invalid, 403 forbidden, 409 duplicate, 429 rate limited, 500 server).
- Log server errors with a `[route]` prefix; never leak stack traces to clients.
- Client fetches handle offline gracefully and keep showing the last known data with its timestamp.

## 9. Testing (see TESTING.md)
- Every business rule in `src/lib` has unit tests. New rule ⇒ new test.
- Never claim a test passed without running it.
- Before a PR: `npm run check` (typecheck + lint + tests). UI changes: also a browser check at 390px and 1366px.

## 9b. Data sources
- Every source must be in `src/lib/sources/registry.ts` with tier, usage and integration status, and documented in SOURCES.md, before any code uses it.
- Only integrate sources verified as accessible without bypassing logins, terms or robots rules. Record the check in `notes`.
- Parsers fail closed (throw), never write partial or guessed data, and ship with a real fixture.
- DisCo mappings need an official citation. Never infer them.
- Grid figures can confirm outages only; never "light dey".

## 10. Prohibited
- Fake/sample electricity reports or observations in production paths.
- Hard-coding any area's status.
- Hardcoded thresholds outside `config.ts`.
- New dependencies without a stated reason in the PR.
- Disabling lint rules or TS checks to get green.
- Silent removal of working features.
- Committing `.env*` files (except `.env.example`).

## 11. Pull requests
Small and focused (one backlog item). Use `.github/pull_request_template.md`. Branch name: `ld-<task-id>-<short-slug>`. Never auto-merge; a human approves.

## 12. Definition of Done
- [ ] Implementation finished; acceptance criteria in BACKLOG.md met
- [ ] Relevant tests added and passing (`npm run check`)
- [ ] TypeScript and lint pass
- [ ] Security implications considered and noted in the PR
- [ ] Docs updated (ARCHITECTURE/CHANGELOG/BACKLOG)
- [ ] PR description complete; external review (Qodo) addressed or recorded as pending

## 13. Task template
```
### LD-XXX — Title
Priority: P0|P1|P2   Depends on: LD-YYY   Status: todo|doing|done
Description:
Acceptance criteria:
- ...
Expected tests:
- ...
```
