/**
 * Source registry: every place electricity evidence could come from, whether
 * we use it, and why. Mirrors SOURCES.md and is seeded into lightdey.sources
 * (`npm run gen:seed`). A source only influences the map when `active` is true
 * AND it has an adapter or approved credentials.
 *
 * Trust tiers: 1 official (grid operator / DisCo / approved DisCo partner),
 * 2 verified reporters & approved partners, 3 ordinary community reports,
 * 4 estimates from history. Lower number = more trusted.
 */
export type SourceKind = "official_grid" | "official_disco" | "regulator" | "verified_partner" | "verified_reporter" | "community" | "estimate";
export type TrustTier = 1 | 2 | 3 | 4;
export type Integration = "live" | "awaiting_credentials" | "awaiting_partner" | "unavailable" | "derived";

export interface SourceMeta {
  id: string;
  name: string;
  shortName: string;
  kind: SourceKind;
  tier: TrustTier;
  coverage: string;
  url: string | null;
  credentials: string | null; // env var(s) needed, if any
  refreshMinutes: number | null;
  reliability: string;
  integration: Integration;
  active: boolean;
  /** What this source is allowed to assert. */
  usage: string;
  notes: string;
}

export const SOURCES: SourceMeta[] = [
  {
    id: "niso_niggrid",
    name: "NISO Grid Data Portal (NIGGRID)",
    shortName: "NISO grid data",
    kind: "official_grid",
    tier: 1,
    coverage: "National grid; per-DisCo load allocation (incl. Eko and Ikeja DisCos)",
    url: "https://www.niggrid.org/DisCoLoadProfile",
    credentials: null,
    refreshMinutes: 10,
    reliability: "Official system-operator figures, published as a public web page (no API). Updates roughly hourly.",
    integration: "live",
    active: true,
    usage: "Outage only: national grid collapse (total allocation below threshold) affects every area; a DisCo at ~0 MW affects only areas officially mapped to it. Positive MW is context, never 'light dey'.",
    notes: "Public page, no login, no robots.txt (pages carry noindex). Fetched at most every 10 minutes with an identifying User-Agent. Kill switch: SOURCE_NISO_ENABLED=0.",
  },
  {
    id: "ikeja_electric_notices",
    name: "Ikeja Electric public notices (RSS)",
    shortName: "Ikeja Electric notices",
    kind: "official_disco",
    tier: 1,
    coverage: "Ikeja Electric franchise area (northern Lagos)",
    url: "https://www.ikejaelectric.com/feed/",
    credentials: null,
    refreshMinutes: 60,
    reliability: "Official DisCo notices. Free text; feeder lists are often images, so areas are matched by name only.",
    integration: "live",
    active: true,
    usage: "Context only: notices that name a supported area are linked on that area's page. Never sets a live status.",
    notes: "Official RSS feed intended for syndication. robots.txt Crawl-delay 10 is respected by fetching once an hour. Kill switch: SOURCE_IKEJA_NOTICES_ENABLED=0.",
  },
  {
    id: "eko_disco_notices",
    name: "Eko Electricity Distribution (EKEDP) notices",
    shortName: "Eko DisCo notices",
    kind: "official_disco",
    tier: 1,
    coverage: "Eko DisCo franchise area (southern Lagos)",
    url: "https://ekedp.com/",
    credentials: null,
    refreshMinutes: null,
    reliability: "Official, but published on social media and the website as free text/images.",
    integration: "unavailable",
    active: false,
    usage: "None yet.",
    notes: "No machine-readable feed found (ekedp.com/feed returns 404, checked 2026-11-13). Would need a partner feed or the X API.",
  },
  {
    id: "x_disco_accounts",
    name: "DisCo / TCN / NISO posts on X",
    shortName: "X posts",
    kind: "official_disco",
    tier: 1,
    coverage: "Lagos DisCos, TCN, NISO",
    url: "https://developer.x.com/",
    credentials: "X_BEARER_TOKEN (paid X API tier)",
    refreshMinutes: null,
    reliability: "Official accounts, free text.",
    integration: "awaiting_credentials",
    active: false,
    usage: "Would be context-only notices, like the Ikeja Electric feed.",
    notes: "Reading posts requires a paid X API plan. Not implemented until credentials exist.",
  },
  {
    id: "partner_feed",
    name: "Approved partner feeds (DisCo, estate, facility operators)",
    shortName: "Approved partner",
    kind: "verified_partner",
    tier: 1,
    coverage: "Per partner agreement",
    url: null,
    credentials: "Partner API key issued with `npm run partner:key`",
    refreshMinutes: null,
    reliability: "Depends on partner; each partner is a separate source row with its own key.",
    integration: "awaiting_partner",
    active: false,
    usage: "Neighbourhood status reports via POST /api/ingest/observations. A tier-1 partner report confirms a status.",
    notes: "Ingestion API implemented; no partners approved yet.",
  },
  {
    id: "verified_reporters",
    name: "Verified community reporters",
    shortName: "Verified reporter",
    kind: "verified_reporter",
    tier: 2,
    coverage: "Per reporter's home neighbourhood",
    url: null,
    credentials: "Per-reporter API key issued with `npm run partner:key`",
    refreshMinutes: null,
    reliability: "Vetted individuals. Two independent verified reporters (or one plus a community confirmation) confirm a status.",
    integration: "awaiting_partner",
    active: false,
    usage: "Neighbourhood status reports via the ingestion API.",
    notes: "No reporters verified yet. Each vetted person gets their own source (verified:<slug>) so independent reporters are counted separately; this row is the public label and never holds keys. Account-based verification arrives with sign-in (LD-014).",
  },
  {
    id: "community",
    name: "Light Dey? community reports",
    shortName: "Community reports",
    kind: "community",
    tier: 3,
    coverage: "All supported Lagos neighbourhoods",
    url: null,
    credentials: null,
    refreshMinutes: null,
    reliability: "Anonymous, rate-limited, deduplicated. Needs several independent reporters (max 2 per network) within 60 minutes — see /about for the current threshold.",
    integration: "live",
    active: true,
    usage: "Community-reported light / no light, or conflicting.",
    notes: "Submitted at /report and on each area page.",
  },
  {
    id: "nerc_reports",
    name: "NERC quarterly & energy-cap reports",
    shortName: "NERC reports",
    kind: "regulator",
    tier: 1,
    coverage: "National, per DisCo, per feeder (monthly/quarterly)",
    url: "https://nerc.gov.ng/",
    credentials: null,
    refreshMinutes: null,
    reliability: "Official but historical PDFs; not live.",
    integration: "unavailable",
    active: false,
    usage: "None for live status. Candidate for feeder→area mapping research (LD-049).",
    notes: "PDF publications only.",
  },
  {
    id: "historical_estimate",
    name: "Historical pattern estimate",
    shortName: "Estimate from history",
    kind: "estimate",
    tier: 4,
    coverage: "Areas with enough confirmed community history",
    url: null,
    credentials: null,
    refreshMinutes: 60,
    reliability: "Statistical: share of past confirmed hours at this time of day. Not live.",
    integration: "derived",
    active: true,
    usage: "Shown only when there is no live evidence, labelled 'Estimate'. Needs ≥6 confirmed hours at this hour and ≥70% one way.",
    notes: "Computed from stored community history only.",
  },
];

const byId = new Map(SOURCES.map((s) => [s.id, s]));

/** Hosts we will link to as "Source". Anything else (or non-https) is never shown as attribution. */
export const TRUSTED_SOURCE_HOSTS = new Set(["www.niggrid.org", "niggrid.org", "www.ikejaelectric.com", "ikejaelectric.com", "ekedp.com", "www.ekedp.com"]);
export function isTrustedSourceUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && TRUSTED_SOURCE_HOSTS.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}
export function getSource(id: string): SourceMeta | undefined {
  return byId.get(id);
}
