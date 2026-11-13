import type { Report } from "../types";

export type NewReport = Omit<Report, "id">;

/** Persistence boundary. Business rules live in services, not here. */
export interface DataStore {
  readonly kind: "memory" | "supabase";
  insertReport(r: NewReport & { lat?: number; lng?: number }): Promise<Report>;
  /** Reports created at or after `since`, optionally for one area. */
  listReports(opts: { since: Date; areaId?: string }): Promise<Report[]>;
  reportsByReporter(reporterId: string, since: Date): Promise<Report[]>;
  countByNetwork(networkHash: string, since: Date): Promise<number>;
}
