/**
 * Business rules for Light Dey?. Every threshold lives here so it can be tuned
 * (or later moved to the database) without touching aggregation code.
 * All durations are in minutes.
 */
export const STATUS_CONFIG = {
  /** Reports older than this are ignored when computing the live status. */
  reportingWindowMinutes: 60,
  /** Distinct reporters needed before an area is confirmed GREEN or RED. */
  confirmationThreshold: 3,
  /** Max reports from one network (hashed IP) that count toward one area's status. */
  maxCountedPerNetwork: 2,
  freshness: {
    freshMaxMinutes: 15,
    recentMaxMinutes: 30,
    ageingMaxMinutes: 60,
  },
  /** Confirmed + this many agreeing reporters (and fresh) => high confidence. */
  highConfidenceReporters: 5,
} as const;

export const REPORTING_RULES = {
  /** Same reporter, same area, same status inside this window is a duplicate. */
  duplicateWindowMinutes: 10,
  /** Per-reporter cap across all areas. */
  reporterLimit: { max: 6, windowMinutes: 10 },
  /** Per-network (hashed IP) cap, looser because of shared mobile/carrier IPs. */
  networkLimit: { max: 30, windowMinutes: 10 },
  /** A GPS fix within this distance of an area's centre counts as location-matched. */
  locationMatchKm: 3,
  commentMaxLength: 140,
} as const;

/** Nigeria observes WAT (UTC+1) all year with no daylight saving. */
export const TIMEZONE = "Africa/Lagos";
export const LAGOS_UTC_OFFSET_MINUTES = 60;

export type StatusConfig = typeof STATUS_CONFIG;

/** Evidence engine rules (see ARCHITECTURE.md#evidence). */
export const EVIDENCE_CONFIG = {
  /**
   * Official grid/DisCo figures older than this are ignored. NISO publishes roughly
   * hourly, so this must exceed the cadence plus fetch lag; recoveries still show
   * immediately because a newer reading supersedes an older one.
   */
  officialMaxAgeMinutes: 90,
  /** A DisCo allocated at or below this many MW is treated as getting no grid supply. */
  discoOutageMaxMw: 5,
  /** National total DisCo allocation at or below this many MW is treated as a grid collapse. */
  gridCollapseMaxMw: 300,
  /** Partner / verified-reporter neighbourhood reports expire after this. */
  partnerMaxAgeMinutes: 60,
  /** Independent verified reporters needed to confirm on their own. */
  verifiedConfirmCount: 2,
  /** Official notices are linked on area pages for this long. */
  noticeMaxAgeDays: 14,
  estimate: { minSamples: 6, minProbability: 0.7, windowDays: 30 },
} as const;
