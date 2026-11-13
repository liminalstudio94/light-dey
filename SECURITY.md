# Security

## Reporting a vulnerability
Please report privately to the maintainers (see /contact). Do not open a public issue.

## Model
- Secrets (`SUPABASE_SECRET_KEY`, `REPORTER_HASH_SECRET`) are server-only; modules using them import `server-only`. A test fails if client components reference them.
- All writes to reports go through `submitReport()` on the server. Public Supabase keys cannot read or write reports (RLS + revoke).
- Input validated with zod; comments limited to 140 chars and links rejected.
- POST endpoints reject cross-origin `Origin` headers.
- IPs are HMAC-hashed; raw IPs are not stored. Location is optional and only stored with the report.

## Known limitations (tracked in BACKLOG.md)
- Anonymous ids can be rotated by clearing cookies. Mitigated by per-network caps; CAPTCHA + reputation pending (LD-013, LD-015).
- Rate-limit check and insert are not atomic (LD-012).
- GPS can be spoofed; location-matched is a signal only.
- Admin/moderation not built yet (LD-017).
