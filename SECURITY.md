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

## Known limitations (tracked in BACKLOG.md)
- Anonymous ids can be rotated by clearing cookies. Mitigated by per-network caps; CAPTCHA + reputation pending (LD-013, LD-015).
- Rate-limit check and insert are not atomic (LD-012).
- GPS can be spoofed; location-matched is a signal only.
- Admin/moderation not built yet (LD-017).
