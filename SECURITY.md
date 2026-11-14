# Security

## Reporting a vulnerability
Please report privately to the maintainers (see /contact). Do not open a public issue.

## Model
- Secrets (`POSTGRES_URL`, `REPORTER_HASH_SECRET`) are server-only; modules using them import `server-only`. A test fails if client components reference them.
- All writes to reports go through `submitReport()` on the server. The `lightdey` schema is not exposed via the Supabase Data API and public roles have no grants; RLS is on as a second layer.
- The database is shared with another app (separate schema). Moving to a dedicated project is LD-032.
- Input validated with zod; comments limited to 140 chars and links rejected.
- POST endpoints reject cross-origin `Origin` headers.
- IPs are HMAC-hashed; raw IPs are not stored. Location is optional and only stored with the report.

- `/api/cron/refresh` requires `CRON_SECRET` (timing-safe compare). `/api/ingest/observations` requires a per-partner key; only SHA-256 hashes are stored, keys can be revoked, and writes are limited to 120 per key per hour.
- Outbound fetches go only to the registered source URLs, with a User-Agent that carries no personal data. Parsers fail closed.

- `/api/sensors/heartbeat`: 2 KB cap enforced on the declared length and while streaming; per-network token bucket and a 5-minute negative cache of unknown device ids run **before** any database lookup (per server instance). **Configure a Vercel Firewall rate-limit rule on `/api/sensors/heartbeat` as the global backstop** (e.g. 120 req/min per IP).

## Known limitations (tracked in BACKLOG.md)
- Anonymous ids can be rotated by clearing cookies. Mitigated by per-network caps; CAPTCHA + reputation pending (LD-013, LD-015).
- Rate-limit check and insert are not atomic (LD-012).
- GPS can be spoofed; location-matched is a signal only.
- Admin/moderation not built yet (LD-017).
