export type PowerStatus = "on" | "off";

/** Live state of an area. Colour mapping: LIGHT=green, NO_LIGHT=red, UNCERTAIN=yellow, UNKNOWN=grey. */
export type AreaState = "LIGHT" | "NO_LIGHT" | "UNCERTAIN" | "UNKNOWN";

export type Freshness = "fresh" | "recent" | "ageing" | "stale" | "none";
export type Confidence = "high" | "medium" | "low" | "none";

export type VerificationState = "unverified" | "location_matched" | "location_mismatch" | "flagged" | "removed";

export interface Report {
  id: string;
  areaId: string;
  status: PowerStatus;
  reporterId: string;
  networkHash: string;
  createdAt: string; // ISO
  verification: VerificationState;
  comment?: string | null;
}

export interface AreaStatus {
  areaId: string;
  state: AreaState;
  /** Distinct counted reporters saying light is on / off in the window. */
  onReporters: number;
  offReporters: number;
  /** Reports in the window (after excluding removed ones). */
  recentReports: number;
  /** Distinct reporters agreeing with the displayed state (0 for UNKNOWN/UNCERTAIN). */
  confirmingUsers: number;
  lastReportAt: string | null;
  freshness: Freshness;
  confidence: Confidence;
  /** For unconfirmed areas: which way the few reports lean, if any. */
  leaning: PowerStatus | null;
  locationMatchedReports: number;
  /** Final evidence-based state (set by the evidence engine). */
  mapState?: MapState;
  evidence?: EvidenceItem[];
  explanation?: string;
  estimate?: Estimate | null;
  disco?: string | null;
}

export interface RecentUpdate {
  id: string;
  areaId: string;
  status: "on" | "off";
  createdAt: string;
  locationMatched: boolean;
}

export interface Overview {
  statuses: AreaStatus[];
  counts: Record<AreaState, number>;
  recent: RecentUpdate[];
  reportsLast24h: number;
  reportersLast24h: number;
  areasReportedLast24h: number;
  generatedAt: string;
  storeKind: "memory" | "supabase";
  mapCounts?: Record<MapState, number>;
  grid?: GridContext | null;
}

// ---------- Evidence ----------

/**
 * What the map shows. "CONFIRMED_*" needs official or verified evidence;
 * "COMMUNITY_*" is ordinary reports (3+ independent people); "ESTIMATED_*" is
 * history only and never live; "UNKNOWN" means not enough trustworthy data.
 */
export type MapState = "CONFIRMED_ON" | "CONFIRMED_OFF" | "COMMUNITY_ON" | "COMMUNITY_OFF" | "CONFLICTING" | "ESTIMATED_ON" | "ESTIMATED_OFF" | "UNKNOWN";

export type ObservationScope = "national" | "disco" | "neighbourhood";
export type ObservationKind = "grid_total" | "disco_allocation" | "notice" | "status_report";

/** A raw, attributable observation from a non-community source. */
export interface Observation {
  id: string;
  sourceId: string;
  externalId: string;
  scope: ObservationScope;
  scopeRef: string | null;
  kind: ObservationKind;
  /** null = context only; never treated as a status claim. */
  status: PowerStatus | null;
  valueNum: number | null;
  title: string | null;
  url: string | null;
  observedAt: string;
  validUntil: string;
  /** For notices: supported areas named in the text. */
  neighbourhoodIds: string[];
  /** Trust tier of the producing source (partner sources carry their own). */
  tier: 1 | 2 | 3 | 4;
}

export type EvidenceRole = "decisive" | "supporting" | "conflicting" | "context" | "estimate";

/** One line of attribution shown to users. */
export interface EvidenceItem {
  sourceId: string;
  sourceName: string;
  tier: 1 | 2 | 3 | 4;
  role: EvidenceRole;
  status: PowerStatus | null;
  summary: string;
  count: number;
  observedAt: string | null;
  freshness: Freshness;
  url: string | null;
}

export interface Estimate {
  status: PowerStatus;
  probability: number; // 0-1, share of past confirmed hours
  samples: number; // confirmed hours behind it
  hour: number; // Lagos hour of day
}

export interface HourPattern {
  areaId: string;
  hour: number;
  lightHours: number;
  knownHours: number;
}

export interface GridContext {
  /** Newest reading time; each figure also carries its own time. */
  asOf: string;
  totalMw: number | null;
  totalAsOf: string | null;
  discos: { id: string; name: string; mw: number; asOf: string }[];
  sourceUrl: string;
  collapse: boolean;
}
