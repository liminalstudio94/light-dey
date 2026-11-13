import { randomUUID } from "node:crypto";
import type { Report } from "../types";
import type { DataStore, NewReport } from "./types";

/**
 * In-process store for local development and tests. Starts EMPTY — it never
 * seeds electricity data. Data is lost on restart; production uses Supabase.
 */
export class MemoryStore implements DataStore {
  readonly kind = "memory" as const;
  private reports: Report[] = [];

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
}
