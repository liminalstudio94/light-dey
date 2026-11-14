import "server-only";
import postgres from "postgres";
import type { HourPattern, MapState, Observation, Report } from "../types";
import { ObservationScopeConflict, type DataStore, type NewObservation, type NewReport, type PartnerKey, type RunResult, type SnapshotRow } from "./types";

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
 * the browser. `prepare: false` and `max_pipeline: 1` keep it compatible with
 * the Supabase transaction pooler: pipelining several queries on one pooled
 * connection hung the whole pool in production (2026-11-13).
 */
export class PostgresStore implements DataStore {
  readonly kind = "supabase" as const;
  private sql: postgres.Sql;
  constructor(url: string) {
    this.sql = postgres(url, { prepare: false, max_pipeline: 1, max: 3, idle_timeout: 20, connect_timeout: 10, ssl: url.includes("localhost") ? false : "require" });
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
    // Latest unexpired reading per (source, kind, scope, area) plus every unexpired notice.
    // No global row cap: older-but-valid evidence for quiet areas must never be dropped.
    const rows = await this.sql<
      { id: string; source_id: string; external_id: string; scope: Observation["scope"]; scope_ref: string | null; kind: Observation["kind"]; status: Observation["status"]; value_num: number | null; title: string | null; url: string | null; observed_at: Date; valid_until: Date; tier: number; areas: string[] | null }[]
    >`
      -- Newest reading per measure FIRST, then drop it if expired: an expired newer reading must
      -- never let an older, longer-lived one "revive". (2-day bound: nothing older can be valid.)
      with newest as (
        select distinct on (source_id, kind, scope, coalesce(scope_ref, '')) *
        from lightdey.observations
        where kind <> 'notice' and observed_at <= ${now}::timestamptz + interval '2 minutes' and observed_at >= ${now}::timestamptz - interval '2 days'
        order by source_id, kind, scope, coalesce(scope_ref, ''), observed_at desc
      ), picked as (
        select * from newest where valid_until >= ${now}
        union all
        select * from lightdey.observations where valid_until >= ${now} and kind = 'notice'
      )
      select o.id, o.source_id, o.external_id, o.scope, o.scope_ref, o.kind, o.status, o.value_num, o.title, o.url, o.observed_at, o.valid_until,
             s.trust_tier as tier, array_remove(array_agg(onb.neighbourhood_id), null) as areas
      from picked o
      join lightdey.sources s on s.id = o.source_id and s.is_active
      left join lightdey.observation_neighbourhoods onb on onb.observation_id = o.id
      group by o.id, o.source_id, o.external_id, o.scope, o.scope_ref, o.kind, o.status, o.value_num, o.title, o.url, o.observed_at, o.valid_until, s.trust_tier
      order by o.observed_at desc`;
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

  async upsertObservations(rows: NewObservation[], opts: { audit?: { event: "partner_ingested"; actor: string } } = {}): Promise<number> {
    let written = 0;
    // The whole batch is ONE transaction: if any row fails, nothing from this run becomes evidence.
    await this.sql.begin(async (tx) => {
      for (const r of rows) {
        // Every mutable column takes part in change detection, so corrections are never discarded.
        const changed = await tx<{ id: string }[]>`
          insert into lightdey.observations as o_old (source_id, external_id, scope, scope_ref, kind, status, value_num, title, url, observed_at, valid_until, payload)
          values (${r.sourceId}, ${r.externalId}, ${r.scope}, ${r.scopeRef}, ${r.kind}, ${r.status}, ${r.valueNum}, ${r.title}, ${r.url}, ${r.observedAt}, ${r.validUntil}, ${tx.json((r.payload ?? {}) as postgres.JSONValue)})
          on conflict (source_id, external_id) do update set
            scope = excluded.scope, scope_ref = excluded.scope_ref, kind = excluded.kind, status = excluded.status, value_num = excluded.value_num,
            title = excluded.title, url = excluded.url, observed_at = excluded.observed_at, valid_until = excluded.valid_until,
            payload = excluded.payload, fetched_at = now()
          where o_old.scope = excluded.scope and o_old.scope_ref is not distinct from excluded.scope_ref and o_old.kind = excluded.kind
            and (o_old.scope, o_old.scope_ref, o_old.kind, o_old.status, o_old.value_num, o_old.title, o_old.url, o_old.observed_at, o_old.valid_until, o_old.payload)
                is distinct from
                (excluded.scope, excluded.scope_ref, excluded.kind, excluded.status, excluded.value_num, excluded.title, excluded.url, excluded.observed_at, excluded.valid_until, excluded.payload)
          returning id`;
        // An observation never moves to another scope/area; the conflict clause above refuses it atomically.
        const [{ id, scope_ref }] = changed.length
          ? [{ id: changed[0].id, scope_ref: r.scopeRef }]
          : await tx<{ id: string; scope_ref: string | null }[]>`select id, scope_ref from lightdey.observations where source_id = ${r.sourceId} and external_id = ${r.externalId}`;
        if (scope_ref !== r.scopeRef) throw new ObservationScopeConflict(scope_ref);
        // Always reconcile area links (including clearing them), and count a link change as a write.
        const current = (await tx<{ n: string }[]>`select neighbourhood_id as n from lightdey.observation_neighbourhoods where observation_id = ${id}`).map((x) => x.n).sort();
        const wanted = [...new Set(r.neighbourhoodIds)].sort();
        const linksChanged = current.join(",") !== wanted.join(",");
        if (linksChanged) {
          await tx`delete from lightdey.observation_neighbourhoods where observation_id = ${id}`;
          if (wanted.length) await tx`insert into lightdey.observation_neighbourhoods ${tx(wanted.map((n) => ({ observation_id: id, neighbourhood_id: n })))}`;
        }
        if (changed.length || linksChanged) {
          written++;
          if (opts.audit) await tx`insert into lightdey.verification_events (observation_id, event, actor) values (${id}, ${opts.audit.event}, ${opts.audit.actor})`;
        }
      }
    });
    return written;
  }

  async acquireLease(sourceId: string, minIntervalMinutes: number, now: Date, opts: { force?: boolean; runningMinutes?: number } = {}): Promise<boolean> {
    const rows = await this.sql`
      update lightdey.sources set last_attempt_at = ${now}, running_until = ${now}::timestamptz + make_interval(mins => ${opts.runningMinutes ?? 2})
      where id = ${sourceId} and is_active
        and (running_until is null or running_until <= ${now})
        and (${opts.force ?? false} or last_attempt_at is null or last_attempt_at <= ${now}::timestamptz - make_interval(mins => ${minIntervalMinutes}))
      returning id`;
    return rows.length === 1;
  }

  async releaseLease(sourceId: string): Promise<void> {
    await this.sql`update lightdey.sources set running_until = null where id = ${sourceId}`;
  }

  async recordRun(sourceId: string, startedAt: Date, r: RunResult): Promise<void> {
    await this.sql`
      insert into lightdey.source_runs (source_id, started_at, finished_at, status, attempts, items_fetched, items_written, error, log)
      values (${sourceId}, ${startedAt}, now(), ${r.status}, ${r.attempts}, ${r.itemsFetched}, ${r.itemsWritten}, ${r.error ?? null}, ${this.sql.json(r.log)})`;
    if (r.status === "ok") await this.sql`update lightdey.sources set last_success_at = now() where id = ${sourceId}`;
    if (r.status === "error") await this.sql`update lightdey.sources set last_error_at = now(), last_error = ${(r.error ?? "").slice(0, 500)} where id = ${sourceId}`;
  }

  async listHourPatterns(hour: number): Promise<HourPattern[]> {
    const rows = await this.sql<{ neighbourhood_id: string; hour: number; light_hours: number; known_hours: number; computed_at: Date }[]>`
      select neighbourhood_id, hour, light_hours, known_hours, computed_at from lightdey.hourly_patterns where hour = ${hour}`;
    return rows.map((r) => ({ areaId: r.neighbourhood_id, hour: r.hour, lightHours: r.light_hours, knownHours: r.known_hours, computedAt: r.computed_at.toISOString() }));
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

  async recordSnapshotChanges(rows: SnapshotRow[]): Promise<number> {
    if (!rows.length) return 0;
    // One transaction under an advisory lock: concurrent refreshes can't both see the old state and insert duplicates.
    return this.sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext('lightdey:status_snapshots'))`;
      const prev = new Map(
        (await tx<{ neighbourhood_id: string; map_state: string }[]>`
          select distinct on (neighbourhood_id) neighbourhood_id, map_state from lightdey.status_snapshots order by neighbourhood_id, computed_at desc`).map((r) => [r.neighbourhood_id, r.map_state]),
      );
      const changed = rows.filter((r) => prev.get(r.areaId) !== r.mapState);
      if (changed.length)
        await tx`insert into lightdey.status_snapshots ${tx(changed.map((r) => ({ neighbourhood_id: r.areaId, map_state: r.mapState, confidence: r.confidence, freshness: r.freshness, evidence: tx.json(r.evidence as postgres.JSONValue) })))}`;
      return changed.length;
    });
  }

  async findPartnerKey(keyHash: string): Promise<PartnerKey | null> {
    const rows = await this.sql<{ id: string; source_id: string; trust_tier: number; allowed_neighbourhoods: string[] }[]>`
      select k.id, k.source_id, s.trust_tier, k.allowed_neighbourhoods from lightdey.partner_keys k join lightdey.sources s on s.id = k.source_id
      where k.key_hash = ${keyHash} and k.revoked_at is null and s.is_active`;
    return rows.length ? { keyId: rows[0].id, sourceId: rows[0].source_id, tier: rows[0].trust_tier as PartnerKey["tier"], allowedAreas: rows[0].allowed_neighbourhoods } : null;
  }

  async consumePartnerQuota(keyId: string, limit: number, now: Date): Promise<boolean> {
    // Serialised per key, so simultaneous requests can't both pass the check.
    return this.sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext(${"lightdey:partner:" + keyId}))`;
      const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from lightdey.partner_key_writes where key_id = ${keyId} and written_at > ${now}::timestamptz - interval '1 hour'`;
      // Only the last hour matters: prune this key's older rows so the log stays bounded.
      await tx`delete from lightdey.partner_key_writes where key_id = ${keyId} and written_at <= ${now}::timestamptz - interval '1 hour'`;
      if (n >= limit) return false;
      await tx`insert into lightdey.partner_key_writes (key_id, written_at) values (${keyId}, ${now})`;
      return true;
    });
  }

  async observationScope(sourceId: string, externalId: string): Promise<string | null | undefined> {
    const rows = await this.sql<{ scope_ref: string | null }[]>`select scope_ref from lightdey.observations where source_id = ${sourceId} and external_id = ${externalId}`;
    return rows.length ? rows[0].scope_ref : undefined;
  }

  async recordVerificationEvent(e: { observationExternalId?: string; sourceId?: string; event: string; actor: string; note?: string }): Promise<void> {
    await this.sql`
      insert into lightdey.verification_events (observation_id, event, actor, note)
      select o.id, ${e.event}, ${e.actor}, ${e.note ?? null} from lightdey.observations o
      where o.source_id = ${e.sourceId ?? ""} and o.external_id = ${e.observationExternalId ?? ""}`;
  }
}
