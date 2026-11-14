import { randomUUID } from "node:crypto";
import { getSource } from "../sources/registry";
import type { HourPattern, MapState, Observation, Report } from "../types";
import type { DataStore, NewObservation, NewReport, RunResult, SnapshotRow } from "./types";

/**
 * In-process store for local development and tests. Starts EMPTY — it never
 * seeds electricity data. Data is lost on restart; production uses Postgres.
 */
export class MemoryStore implements DataStore {
  readonly kind = "memory" as const;
  private reports: Report[] = [];
  observations: Observation[] = [];
  runs: { sourceId: string; startedAt: Date; result: RunResult }[] = [];
  private leases = new Map<string, number>();
  private patterns: HourPattern[] = [];
  snapshots: (SnapshotRow & { at: Date })[] = [];
  partnerKeys = new Map<string, { sourceId: string; tier: 1 | 2 | 3 | 4 }>();

  async insertReport(r: NewReport): Promise<Report> {
    const row: Report = { id: randomUUID(), areaId: r.areaId, status: r.status, reporterId: r.reporterId, networkHash: r.networkHash, createdAt: r.createdAt, verification: r.verification, comment: r.comment ?? null };
    this.reports.push(row);
    return row;
  }
  async listReports({ since, areaId }: { since: Date; areaId?: string }) {
    const s = since.getTime();
    return this.reports.filter((r) => Date.parse(r.createdAt) >= s && (!areaId || r.areaId === areaId));
  }
  async reportsByReporter(reporterId: string, since: Date) {
    const s = since.getTime();
    return this.reports.filter((r) => r.reporterId === reporterId && Date.parse(r.createdAt) >= s);
  }
  async countByNetwork(networkHash: string, since: Date) {
    const s = since.getTime();
    return this.reports.filter((r) => r.networkHash === networkHash && Date.parse(r.createdAt) >= s).length;
  }

  /** Mirrors PostgresStore: only unexpired rows from active sources (registry or approved partner). */
  async listObservations(now: Date) {
    return this.observations.filter((o) => Date.parse(o.validUntil) >= now.getTime() && (getSource(o.sourceId)?.active || this.partnerTier(o.sourceId) !== undefined));
  }
  async upsertObservations(rows: NewObservation[]) {
    let n = 0;
    for (const r of rows) {
      const i = this.observations.findIndex((o) => o.sourceId === r.sourceId && o.externalId === r.externalId);
      const tier = this.partnerTier(r.sourceId) ?? getSource(r.sourceId)?.tier ?? 3;
      const { payload: _payload, ...rest } = r;
      void _payload;
      const row: Observation = { ...rest, id: i >= 0 ? this.observations[i].id : randomUUID(), tier };
      if (i >= 0) {
        if (JSON.stringify({ ...this.observations[i], id: "" }) === JSON.stringify({ ...row, id: "" })) continue;
        this.observations[i] = row;
      } else this.observations.push(row);
      n++;
    }
    return n;
  }
  private partnerTier(sourceId: string) {
    for (const v of this.partnerKeys.values()) if (v.sourceId === sourceId) return v.tier;
    return undefined;
  }
  async acquireLease(sourceId: string, minIntervalMinutes: number, now: Date) {
    const last = this.leases.get(sourceId);
    if (last !== undefined && now.getTime() - last < minIntervalMinutes * 60_000) return false;
    this.leases.set(sourceId, now.getTime());
    return true;
  }
  async recordRun(sourceId: string, startedAt: Date, result: RunResult) {
    this.runs.push({ sourceId, startedAt, result });
  }
  async listHourPatterns(hour: number) {
    return this.patterns.filter((p) => p.hour === hour);
  }
  async replaceHourPatterns(rows: HourPattern[]) {
    const computedAt = new Date().toISOString();
    this.patterns = rows.map((r) => ({ ...r, computedAt: r.computedAt ?? computedAt }));
  }
  async latestMapStates() {
    const m = new Map<string, MapState>();
    for (const s of this.snapshots) m.set(s.areaId, s.mapState);
    return m;
  }
  async insertSnapshots(rows: SnapshotRow[]) {
    const at = new Date();
    this.snapshots.push(...rows.map((r) => ({ ...r, at })));
  }
  async findPartnerKey(keyHash: string) {
    return this.partnerKeys.get(keyHash) ?? null;
  }
}
