# Data sources

Source of truth: `src/lib/sources/registry.ts` (seeded into `lightdey.sources`). The public version is at `/sources`.
Last verified: **2026-11-13**.

## Summary (verified 2026-11-14)

| Source | Owner | Type | Status | What it may assert |
|---|---|---|---|---|
| NISO Grid Data Portal — DisCo load profile | NISO | official grid | ✅ **Live** | Outage only: national collapse, or a mapped DisCo at ~0 MW |
| Ikeja Electric public notices (RSS) | Ikeja Electric | official DisCo | ✅ **Live** | Context only: links notices that name an area |
| Light Dey community reports | public | reported | ✅ **Live** | Reported (3+ independent neighbours) |
| Historical pattern | derived | estimate | ✅ **Live (derived)** | Labelled prediction only, never live |
| Light Dey Sensor (protocol v1) | opt-in hosts | measured telemetry | 🔧 **Implemented — needs devices** | Confirmed / Likely from mains readings |
| Verified reporters | vetted people | reported | 🔧 **Implemented — needs approvals** | 1 ⇒ Reported; 2 (or 1 + neighbours) ⇒ Likely |
| Verified partners (shops, security desks, estates) | partners | reported | 🔧 **Implemented — needs partnerships** | as verified reporters |
| Official DisCo partner feed | Eko / Ikeja | official | 🔧 **Implemented — needs partnership** | Confirmed |
| IODA internet connectivity (Lagos State) | Georgia Tech | weak proxy | 🔧 **Implemented, OFF — awaiting permission** | Lagos-wide context only |
| Victron VRM (inverters) | owners | device provider | 🔑 **Requires owner token + consent** (not implemented) | would be measured |
| Shelly Cloud (smart plugs) | owners | device provider | 🔑 **Requires owner key + consent** (not implemented) | would be measured |
| DisCo / TCN / NISO posts on X | official | official | 🔑 **Requires paid X API** (not implemented) | context only |
| Eko DisCo website | Eko DisCo | official | ❌ **Rejected** — no feed (404) | — |
| TCN website | TCN | official | ❌ **Rejected** — notices page is procurement PDFs | — |
| NERC feed / reports | NERC | regulator | ❌ **Rejected for live use** — feed last post July 2025, PDFs only | — |
| LASERC | Lagos regulator | regulator | ❌ **Rejected** — unreachable | — |
| Downdetector, Google "popular times", road cameras, social posts | various | proxy | ❌ **Rejected** — terms forbid scraping / unverifiable / too coarse | — |

**Only user/community-supplied today:** neighbourhood-level "light dey" in every area, until sensors are deployed. No accessible public source says a particular neighbourhood *has* power now; grid data can only prove outages.

## Live sources

### NISO Grid Data Portal (NIGGRID)
- URL: https://www.niggrid.org/DisCoLoadProfile (official Nigerian Independent System Operator portal)
- Access: public HTML page, no login, no API, no robots.txt (pages carry `noindex`, which governs search indexing, not access). No terms of use found on the site.
- Fetch: at most every **10 minutes** (`lightdey.sources.last_attempt_at` lease), 12 s timeout, 3 attempts with backoff, identifying User-Agent `LightDey/1.0 (+<site>/sources; …)`.
- Parsed: "Data as at dd/mm/yyyy hh:mm:ss" (Lagos time) and the `MainContent_gvDiscoLoadProfiles` table. Fails closed if the timestamp, Eko/Ikeja rows or page total are missing or inconsistent.
- Stored: `grid_total` (national) + `disco_allocation` for Eko and Ikeja. Valid 90 minutes from "as at" (NISO publishes about hourly). The **newest reading per DisCo/total always replaces older ones**, so a recovery clears an outage at once.
- Outage status is derived from the MW value at read time, never trusted from a stored flag. The page's own **Total row is required** and must match the DisCo sum, or the run fails.
- Rules: total ≤ **300 MW** ⇒ national collapse ⇒ `CONFIRMED_OFF` for every Lagos area. DisCo ≤ **5 MW** ⇒ `CONFIRMED_OFF` **only** for areas in `src/lib/sources/discos.ts`. Anything else is context ("Eko DisCo is receiving 482 MW…").
- Kill switch: `SOURCE_NISO_ENABLED=0`.

### Ikeja Electric notices
- URL: https://www.ikejaelectric.com/feed/ (WordPress RSS, intended for syndication). robots.txt: `Crawl-delay: 10`; we fetch hourly.
- Stored: notices from the last 14 days whose title or text names a supported area (full name, or a ≥4-letter alias unique to one area — shared aliases like "lekki" are ignored), and whose link is on Ikeja Electric's own https site. Truncated or malformed feeds fail the run. Feeder lists are often images, so most notices can't be matched.
- Never sets a status. Shown as "Official notice" context on the named areas.
- Kill switch: `SOURCE_IKEJA_NOTICES_ENABLED=0`.

### Community reports
Anonymous reports through `/api/reports`: zod validation, 10-minute duplicate window, 6 reports per reporter per 10 min, 30 per network per 10 min, at most 2 counted reporters per network per area, honeypot, same-origin check, latest report per reporter. 3 independent reporters within 60 minutes ⇒ "Reported".

### Historical estimate
Hour-of-day pattern from the last 30 days of confirmed community hours (`hourly_patterns`, recomputed hourly). Used only when an area has no live evidence, with ≥ 6 samples at ≥ 70% one way. Always labelled "Estimate … not live", drawn as a dashed hollow marker, never coloured as live.

## Light Dey sensors

See **SENSORS.md** for the protocol, security, privacy and setup. Status: implemented and tested end to end with the reference client; no devices deployed.

## IODA (opt-in proxy)

`https://api.ioda.inetintel.cc.gatech.edu/v2/outages/events?entityType=region&entityCode=2935` (Lagos State). Reachable without credentials (checked 2026-11-14), but responses state "All Rights Reserved" and no data-use terms are published, so the adapter stays **off** (`SOURCE_IODA_ENABLED=0`) until IODA grants permission (contact: data-info at CAIDA/Georgia Tech). When on, an ongoing Lagos-region event becomes Lagos-wide **context** — never a status: generators, inverters and mobile networks keep the internet up during grid outages.

## Waiting on credentials or approval

### Approved partners & verified reporters (implemented)
1. Approve the partner (agreement, contact, coverage), then:
   ```bash
   npm run partner:key -- --id partner:acme-estate --name "Acme Estate facilities" --kind verified_partner --tier 1 --coverage "Acme Estate, Lekki Phase 1" --areas lekki-phase-1
   # verified individual — one person = one source = one active key, one home area:
   npm run partner:key -- --id verified:ada-yaba --name "Ada (Yaba)" --kind verified_reporter --tier 2 --coverage "Yaba" --areas yaba
   ```
   The key is printed once; only its SHA-256 hash is stored. Revoke with `npm run partner:key -- --revoke <key-id>` — this also **withdraws every live claim made with that key** (audited as `removed`). Switch a whole partner off with `npm run partner:key -- --deactivate <source-id>`; issuing a new key reactivates it.
2. The partner sends:
   ```http
   POST /api/ingest/observations
   Authorization: Bearer ldp_…
   Content-Type: application/json

   {"neighbourhoodId":"yaba","status":"off","observedAt":"2026-11-13T19:05:00+01:00","externalId":"acme-0001","note":"optional"}
   ```
   Rules: known area **within the key's approved `--areas`** (else 403), `on`/`off`, observedAt within the last 60 min and not in the future, idempotent on `externalId` (an id stays bound to its first area; reuse elsewhere → 409), **120 writes per key per hour, enforced atomically** (`partner_key_writes`), audit row in `verification_events`. Partner and reporter ids are never shown publicly ("Approved partner" / "Verified reporter").
   A single verified report is shown as Unknown with the reason; it takes two verified reporters (or one plus neighbours) to confirm.

### X (Twitter)
Requires a paid X API plan (`X_BEARER_TOKEN`). Not implemented. It would reuse the notice pipeline (context only).

## Unavailable
- **Eko DisCo:** `ekedp.com/feed` returns 404. Districts are listed at https://ekedp.com/our-operations (used for the DisCo mapping).
- **NERC:** PDFs only.

## DisCo mapping (`src/lib/sources/discos.ts`)
Only exact name matches with official units: Eko districts (Lekki, Ajah, Islands/Ajele, Apapa, Festac, Ojo, Mushin) and Ikeja Electric business units (Ikeja, Ikorodu, Oshodi, Shomolu). **30 of 41 areas, including Yaba, are unmapped**, so DisCo-level outages never reach them.

## Adding a source
1. Verify it is accessible without bypassing logins, terms or robots rules. Record that in the registry `notes`.
2. Add it to `registry.ts` (tier, usage, integration) and run `npm run gen:seed`.
3. Write an adapter in `src/lib/ingest/` with a fail-closed parser and a real fixture, register it in `ADAPTERS`, and add tests.
4. Decide what it may assert in `src/lib/evidence.ts` and test it.
