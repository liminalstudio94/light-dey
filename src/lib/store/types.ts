import type { HourPattern, MapState, Observation, Report } from "../types";

export type NewReport = Omit<Report, "id">;
export type NewObservation = Omit<Observation, "id" | "tier"> & { payload?: Record<string, unknown> };

export interface SnapshotRow {
  areaId: string;
  mapState: MapState;
  confidence: string;
  freshness: string;
  evidence: unknown;
}

export interface RunResult {
  status: "ok" | "error" | "skipped";
  attempts: number;
  itemsFetched: number;
  itemsWritten: number;
  error?: string;
  log: string[];
}

/** Persistence boundary. Business rules live in services, not here. */
export interface DataStore {
  readonly kind: "memory" | "supabase";
  insertReport(r: NewReport & { lat?: number; lng?: number }): Promise<Report>;
  /** Reports created at or after `since`, optionally for one area. */
  listReports(opts: { since: Date; areaId?: string }): Promise<Report[]>;
  reportsByReporter(reporterId: string, since: Date): Promise<Report[]>;
  countByNetwork(networkHash: string, since: Date): Promise<number>;

  // ---- Evidence ----
  /** Observations not yet expired at `now` (valid_until >= now), with tier and notice mentions. */
  listObservations(now: Date): Promise<Observation[]>;
  /** Idempotent on (sourceId, externalId). Returns rows inserted or changed. */
  upsertObservations(rows: NewObservation[]): Promise<number>;
  /** Atomically claims a source for a run if its refresh interval has passed. */
  acquireLease(sourceId: string, minIntervalMinutes: number, now: Date): Promise<boolean>;
  recordRun(sourceId: string, startedAt: Date, result: RunResult): Promise<void>;
  listHourPatterns(hour: number): Promise<HourPattern[]>;
  replaceHourPatterns(rows: HourPattern[], windowDays: number): Promise<void>;
  /** Latest snapshot state per area. */
  latestMapStates(): Promise<Map<string, MapState>>;
  insertSnapshots(rows: SnapshotRow[]): Promise<void>;
  /** Partner key lookup by SHA-256 hash; null if unknown or revoked or source inactive. */
  findPartnerKey(keyHash: string): Promise<{ sourceId: string; tier: 1 | 2 | 3 | 4 } | null>;
}
