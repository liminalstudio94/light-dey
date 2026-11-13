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
}
