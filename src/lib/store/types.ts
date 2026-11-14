import type { DeviceRow } from "../sensors/health";
import type { HourPattern, MapState, Observation, Report, SourceKind } from "../types";

export type NewReport = Omit<Report, "id">;
export type NewObservation = Omit<Observation, "id" | "tier"> & { payload?: Record<string, unknown> };

export interface SnapshotRow {
  areaId: string;
  mapState: MapState;
  confidence: string;
  freshness: string;
  evidence: unknown;
}

/** Thrown when an upsert would move an existing observation to a different scope/area. */
export class ObservationScopeConflict extends Error {
  constructor(readonly existingScopeRef: string | null) {
    super("observation already exists for a different scope");
  }
}

export interface PartnerKey {
  keyId: string;
  sourceId: string;
  tier: 1 | 2 | 3 | 4;
  kind?: SourceKind;
  allowedAreas: string[];
}

export interface TimelineEntry {
  mapState: MapState;
  confidence: string;
  at: string;
  /** Public summary of the deciding evidence at that moment (no private ids). */
  basis: string | null;
}

export interface HeartbeatWrite {
  deviceId: string;
  nonce: string;
  deviceTs: Date;
  receivedAt: Date;
  mains: "on" | "off" | "unknown";
  powerSource: string;
  batteryPct: number | null;
  selfTest: "pass" | "fail" | null;
  firmware: string | null;
  clockSkewS: number;
  networkHash: string;
  minIntervalSeconds: number;
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
  /**
   * Idempotent on (sourceId, externalId). Returns rows inserted or changed.
   * `audit`, if given, is written in the SAME transaction for every changed row, so a claim is never live without its audit trail.
   */
  upsertObservations(rows: NewObservation[], opts?: { audit?: { event: "partner_ingested"; actor: string } }): Promise<number>;
  /**
   * Atomically claims a source for a run: never while another run holds it
   * (running lock, even when forced), and only once its interval has passed unless forced.
   */
  acquireLease(sourceId: string, minIntervalMinutes: number, now: Date, opts?: { force?: boolean; runningMinutes?: number }): Promise<boolean>;
  releaseLease(sourceId: string): Promise<void>;
  recordRun(sourceId: string, startedAt: Date, result: RunResult): Promise<void>;
  listHourPatterns(hour: number): Promise<HourPattern[]>;
  replaceHourPatterns(rows: HourPattern[], windowDays: number): Promise<void>;
  /** Latest snapshot state per area. */
  latestMapStates(): Promise<Map<string, MapState>>;
  /** Snapshots for one area since `since`, newest first (the status timeline). */
  listSnapshots(areaId: string, since: Date): Promise<TimelineEntry[]>;
  /** Atomically compares with the latest snapshots and inserts only changed areas. Returns rows inserted. */
  recordSnapshotChanges(rows: SnapshotRow[]): Promise<number>;
  /** Partner key lookup by SHA-256 hash; null if unknown or revoked or source inactive. */
  findPartnerKey(keyHash: string): Promise<PartnerKey | null>;
  /** Atomically records one write for this key if it is under `limit` in the last hour. */
  consumePartnerQuota(keyId: string, limit: number, now: Date): Promise<boolean>;
  /** Area an existing observation was filed under, or undefined if new. */
  observationScope(sourceId: string, externalId: string): Promise<string | null | undefined>;

  // ---- Sensors ----
  getDevice(deviceId: string): Promise<{ deviceId: string; areaId: string; revoked: boolean } | null>;
  /**
   * Atomically: per-device rate limit, nonce replay check, raw heartbeat insert and device
   * state update. Returns "ok", "replay" (nonce seen) or "rate_limited".
   */
  recordHeartbeat(h: HeartbeatWrite): Promise<"ok" | "replay" | "rate_limited" | "out_of_order">;
  /** Every non-revoked device with its latest state (health is computed by the caller). */
  listDevices(): Promise<DeviceRow[]>;
  pruneSensorData(now: Date): Promise<{ nonces: number; heartbeats: number }>;
  recordVerificationEvent(e: { observationExternalId?: string; sourceId?: string; event: "partner_ingested" | "flagged" | "removed" | "restored" | "verified"; actor: string; note?: string }): Promise<void>;
}
