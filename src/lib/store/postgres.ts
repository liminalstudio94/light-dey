import "server-only";
import postgres from "postgres";
import type { Report } from "../types";
import type { DataStore, NewReport } from "./types";

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
}
