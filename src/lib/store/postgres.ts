import "server-only";
import postgres from "postgres";
import type { HourPattern, MapState, Observation, Report } from "../types";
import type { DataStore, NewObservation, NewReport, RunResult, SnapshotRow } from "./types";

type Row = {
  id: string;
  neighbourhood_id: string;
  status: Report["status"];
  reporter_key: string;
  network_hash: string;
  created_at: Date;
  verification: Report["verification"];
  comment: string | null;
};

const toReport = (r: Row): Report => ({
  id: r.id,
  areaId: r.neighbourhood_id,
  status: r.status,
  reporterId: r.reporter_key,
  networkHash: r.network_hash,
  createdAt: r.created_at.toISOString(),
  verification: r.verification,
  comment: r.comment,
});

/**
 * Server-only store talking straight to Postgres (Supabase) in the `lightdey`
 * schema. The connection string carries DB credentials and must never reach
 * the browser. `prepare: false` keeps it compatible with the Supabase
 * transaction pooler used by serverless functions.
 */
export class PostgresStore implements DataStore {
  readonly kind = "supabase" as const;
  private sql: postgres.Sql;
  constructor(url: string) {
    this.sql = postgres(url, { prepare: false, max: 3, idle_timeout: 20, connect_timeout: 10, ssl: url.includes("localhost") ? false : "require" });
  }

  async insertReport(r: NewReport & { lat?: number; lng?: number }): Promise<Report> {
    const [row] = await this.sql<Row[]>`
      insert into lightdey.electricity_reports (neighbourhood_id, status, reporter_key, network_hash, created_at, verification, comment, lat, lng)
      values (${r.areaId}, ${r.status}, ${r.reporterId}, ${r.networkHash}, ${r.createdAt}, ${r.verification}, ${r.comment ?? null}, ${r.lat ?? null}, ${r.lng ?? null})
      returning id, neighbourhood_id, status, reporter_key, network_hash, created_at, verification, comment`;
    return toReport(row);
  }

  async listReports({ since, areaId }: { since: Date; areaId?: string }) {
    const rows = areaId
      ? await this.sql<Row[]>`
          select id, neighbourhood_id, status, reporter_key, network_hash, created_at, verification, comment
          from lightdey.electricity_reports
          where created_at >= ${since} and neighbourhood_id = ${areaId} and verification <> 'removed'
          order by created_at asc limit 50000`
      : await this.sql<Row[]>`
          select id, neighbourhood_id, status, reporter_key, network_hash, created_at, verification, comment
          from lightdey.electricity_reports
          where created_at >= ${since} and verification <> 'removed'
          order by created_at asc limit 50000`;
    return rows.map(toReport);
  }

  async reportsByReporter(reporterId: string, since: Date) {
    const rows = await this.sql<Row[]>`
      select id, neighbourhood_id, status, reporter_key, network_hash, created_at, verification, comment
      from lightdey.electricity_reports where reporter_key = ${reporterId} and created_at >= ${since}`;
    return rows.map(toReport);
  }

  async countByNetwork(networkHash: string, since: Date) {
    const [{ n }] = await this.sql<{ n: number }[]>`
      select count(*)::int as n from lightdey.electricity_reports where network_hash = ${networkHash} and created_at >= ${since}`;
    return n;
  }

  // ---------- Evidence ----------

  async listObservations(now: Date): Promise<Observation[]> {
    const rows = await this.sql<
      { id: string; source_id: string; external_id: string; scope: Observation["scope"]; scope_ref: string | null; kind: Observation["kind"]; status: Observation["status"]; value_num: number | null; title: string | null; url: string | null; observed_at: Date; valid_until: Date; tier: number; areas: string[] | null }[]
    >`
      select o.id, o.source_id, o.external_id, o.scope, o.scope_ref, o.kind, o.status, o.value_num, o.title, o.url, o.observed_at, o.valid_until,
             s.trust_tier as tier, array_remove(array_agg(onb.neighbourhood_id), null) as areas
      from lightdey.observations o
      join lightdey.sources s on s.id = o.source_id and s.is_active
      left join lightdey.observation_neighbourhoods onb on onb.observation_id = o.id
      where o.valid_until >= ${now}
      group by o.id, s.trust_tier
      order by o.observed_at desc
      limit 2000`;
    return rows.map((r) => ({
      id: r.id,
      sourceId: r.source_id,
      externalId: r.external_id,
      scope: r.scope,
      scopeRef: r.scope_ref,
      kind: r.kind,
      status: r.status,
      valueNum: r.value_num,
      title: r.title,
      url: r.url,
      observedAt: r.observed_at.toISOString(),
      validUntil: r.valid_until.toISOString(),
      neighbourhoodIds: r.areas ?? [],
      tier: r.tier as Observation["tier"],
    }));
  }

  async upsertObservations(rows: NewObservation[]): Promise<number> {
    let written = 0;
    for (const r of rows) {
      await this.sql.begin(async (tx) => {
        const res = await tx<{ id: string }[]>`
          insert into lightdey.observations (source_id, external_id, scope, scope_ref, kind, status, value_num, title, url, observed_at, valid_until, payload)
          values (${r.sourceId}, ${r.externalId}, ${r.scope}, ${r.scopeRef}, ${r.kind}, ${r.status}, ${r.valueNum}, ${r.title}, ${r.url}, ${r.observedAt}, ${r.validUntil}, ${tx.json((r.payload ?? {}) as postgres.JSONValue)})
          on conflict (source_id, external_id) do update set
            status = excluded.status, value_num = excluded.value_num, title = excluded.title, url = excluded.url,
            observed_at = excluded.observed_at, valid_until = excluded.valid_until, payload = excluded.payload, fetched_at = now()
          where (lightdey.observations.status, lightdey.observations.value_num, lightdey.observations.title, lightdey.observations.valid_until)
                is distinct from (excluded.status, excluded.value_num, excluded.title, excluded.valid_until)
          returning id`;
        if (!res.length) return;
        written++;
        if (r.neighbourhoodIds.length) {
          await tx`delete from lightdey.observation_neighbourhoods where observation_id = ${res[0].id}`;
          await tx`insert into lightdey.observation_neighbourhoods ${tx(r.neighbourhoodIds.map((n) => ({ observation_id: res[0].id, neighbourhood_id: n })))} on conflict do nothing`;
        }
      });
    }
    return written;
  }

  async acquireLease(sourceId: string, minIntervalMinutes: number, now: Date): Promise<boolean> {
    const rows = await this.sql`
      update lightdey.sources set last_attempt_at = ${now}
      where id = ${sourceId} and is_active
        and (last_attempt_at is null or last_attempt_at <= ${now}::timestamptz - make_interval(mins => ${minIntervalMinutes}))
      returning id`;
    return rows.length === 1;
  }

  async recordRun(sourceId: string, startedAt: Date, r: RunResult): Promise<void> {
    await this.sql`
      insert into lightdey.source_runs (source_id, started_at, finished_at, status, attempts, items_fetched, items_written, error, log)
      values (${sourceId}, ${startedAt}, now(), ${r.status}, ${r.attempts}, ${r.itemsFetched}, ${r.itemsWritten}, ${r.error ?? null}, ${this.sql.json(r.log)})`;
    if (r.status === "ok") await this.sql`update lightdey.sources set last_success_at = now() where id = ${sourceId}`;
    if (r.status === "error") await this.sql`update lightdey.sources set last_error_at = now(), last_error = ${(r.error ?? "").slice(0, 500)} where id = ${sourceId}`;
  }

  async listHourPatterns(hour: number): Promise<HourPattern[]> {
    const rows = await this.sql<{ neighbourhood_id: string; hour: number; light_hours: number; known_hours: number }[]>`
      select neighbourhood_id, hour, light_hours, known_hours from lightdey.hourly_patterns where hour = ${hour}`;
    return rows.map((r) => ({ areaId: r.neighbourhood_id, hour: r.hour, lightHours: r.light_hours, knownHours: r.known_hours }));
  }

  async replaceHourPatterns(rows: HourPattern[], windowDays: number): Promise<void> {
    await this.sql.begin(async (tx) => {
      await tx`delete from lightdey.hourly_patterns`;
      const nonEmpty = rows.filter((r) => r.knownHours > 0);
      if (nonEmpty.length)
        await tx`insert into lightdey.hourly_patterns ${tx(nonEmpty.map((r) => ({ neighbourhood_id: r.areaId, hour: r.hour, light_hours: r.lightHours, known_hours: r.knownHours, window_days: windowDays })))}`;
    });
  }

  async latestMapStates(): Promise<Map<string, MapState>> {
    const rows = await this.sql<{ neighbourhood_id: string; map_state: MapState }[]>`
      select distinct on (neighbourhood_id) neighbourhood_id, map_state from lightdey.status_snapshots order by neighbourhood_id, computed_at desc`;
    return new Map(rows.map((r) => [r.neighbourhood_id, r.map_state]));
  }

  async insertSnapshots(rows: SnapshotRow[]): Promise<void> {
    if (!rows.length) return;
    await this.sql`insert into lightdey.status_snapshots ${this.sql(rows.map((r) => ({ neighbourhood_id: r.areaId, map_state: r.mapState, confidence: r.confidence, freshness: r.freshness, evidence: this.sql.json(r.evidence as postgres.JSONValue) })))}`;
  }

  async findPartnerKey(keyHash: string) {
    const rows = await this.sql<{ source_id: string; trust_tier: number }[]>`
      select k.source_id, s.trust_tier from lightdey.partner_keys k join lightdey.sources s on s.id = k.source_id
      where k.key_hash = ${keyHash} and k.revoked_at is null and s.is_active`;
    return rows.length ? { sourceId: rows[0].source_id, tier: rows[0].trust_tier as 1 | 2 | 3 | 4 } : null;
  }
}
