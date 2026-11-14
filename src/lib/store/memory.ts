import { randomUUID } from "node:crypto";
import { getSource } from "../sources/registry";
import type { HourPattern, MapState, Observation, Report } from "../types";
import { ObservationScopeConflict, type DataStore, type NewObservation, type NewReport, type PartnerKey, type RunResult, type SnapshotRow } from "./types";

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
  private running = new Map<string, number>();
  private quota = new Map<string, number[]>();
  private patterns: HourPattern[] = [];
  snapshots: (SnapshotRow & { at: Date })[] = [];
  partnerKeys = new Map<string, PartnerKey>();

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

  /** Mirrors PostgresStore: newest reading per measure first, THEN drop it if expired; only active sources. */
  async listObservations(now: Date) {
    const t = now.getTime();
    const newest = new Map<string, Observation>();
    const notices: Observation[] = [];
    for (const o of this.observations) {
      if (o.kind === "notice") {
        notices.push(o);
        continue;
      }
      if (Date.parse(o.observedAt) > t + 2 * 60_000) continue;
      const key = `${o.sourceId}|${o.kind}|${o.scope}|${o.scopeRef ?? ""}`;
      const prev = newest.get(key);
      if (!prev || Date.parse(o.observedAt) > Date.parse(prev.observedAt)) newest.set(key, o);
    }
    return [...newest.values(), ...notices].filter((o) => Date.parse(o.validUntil) >= t && (getSource(o.sourceId)?.active || this.partnerTier(o.sourceId) !== undefined));
  }
  async upsertObservations(rows: NewObservation[], opts: { audit?: { event: "partner_ingested"; actor: string } } = {}) {
    let n = 0;
    // Atomic like the Postgres transaction: work on a copy, commit only if every row succeeds.
    const work = [...this.observations];
    const events: { event: string; actor: string }[] = [];
    for (const r of rows) {
      const i = work.findIndex((o) => o.sourceId === r.sourceId && o.externalId === r.externalId);
      if (i >= 0 && (work[i].scope !== r.scope || work[i].scopeRef !== r.scopeRef)) throw new ObservationScopeConflict(work[i].scopeRef);
      const tier = this.partnerTier(r.sourceId) ?? getSource(r.sourceId)?.tier ?? 3;
      const { payload: _payload, ...rest } = r;
      void _payload;
      const row: Observation = { ...rest, id: i >= 0 ? work[i].id : randomUUID(), tier };
      if (i >= 0) {
        if (JSON.stringify({ ...work[i], id: "" }) === JSON.stringify({ ...row, id: "" })) continue;
        work[i] = row;
      } else work.push(row);
      n++;
      if (opts.audit) events.push({ event: opts.audit.event, actor: opts.audit.actor });
    }
    this.observations = work;
    this.events.push(...events);
    return n;
  }
  private partnerTier(sourceId: string) {
    for (const v of this.partnerKeys.values()) if (v.sourceId === sourceId) return v.tier;
    return undefined;
  }
  async acquireLease(sourceId: string, minIntervalMinutes: number, now: Date, opts: { force?: boolean; runningMinutes?: number } = {}) {
    const t = now.getTime();
    if ((this.running.get(sourceId) ?? 0) > t) return false;
    const last = this.leases.get(sourceId);
    if (!opts.force && last !== undefined && t - last < minIntervalMinutes * 60_000) return false;
    this.leases.set(sourceId, t);
    this.running.set(sourceId, t + (opts.runningMinutes ?? 2) * 60_000);
    return true;
  }
  async releaseLease(sourceId: string) {
    this.running.delete(sourceId);
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
  async recordSnapshotChanges(rows: SnapshotRow[]) {
    // No await between read and write: atomic within this process, like the Postgres advisory lock.
    const prev = new Map<string, MapState>();
    for (const x of this.snapshots) prev.set(x.areaId, x.mapState);
    const changed = rows.filter((r) => prev.get(r.areaId) !== r.mapState);
    const at = new Date();
    this.snapshots.push(...changed.map((r) => ({ ...r, at })));
    return changed.length;
  }
  async findPartnerKey(keyHash: string) {
    return this.partnerKeys.get(keyHash) ?? null;
  }
  events: { event: string; actor: string; note?: string }[] = [];
  async consumePartnerQuota(keyId: string, limit: number, now: Date) {
    const recent = (this.quota.get(keyId) ?? []).filter((t) => t > now.getTime() - 3_600_000);
    this.quota.set(keyId, recent); // bounded, like the Postgres prune
    if (recent.length >= limit) return false;
    this.quota.set(keyId, [...recent, now.getTime()]);
    return true;
  }
  async observationScope(sourceId: string, externalId: string) {
    return this.observations.find((o) => o.sourceId === sourceId && o.externalId === externalId)?.scopeRef;
  }
  async recordVerificationEvent(e: { event: string; actor: string; note?: string }) {
    this.events.push(e);
  }
}
