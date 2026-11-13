import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Report, VerificationState } from "../types";
import type { DataStore, NewReport } from "./types";

interface Row {
  id: string;
  neighbourhood_id: string;
  status: "on" | "off";
  reporter_key: string;
  network_hash: string;
  created_at: string;
  verification: VerificationState;
  comment: string | null;
}

const COLS = "id, neighbourhood_id, status, reporter_key, network_hash, created_at, verification, comment";
const toReport = (r: Row): Report => ({ id: r.id, areaId: r.neighbourhood_id, status: r.status, reporterId: r.reporter_key, networkHash: r.network_hash, createdAt: r.created_at, verification: r.verification, comment: r.comment });

/** Server-only. Uses the secret/service key, which must never reach the browser. */
export class SupabaseStore implements DataStore {
  readonly kind = "supabase" as const;
  private db: SupabaseClient;
  constructor(url: string, secretKey: string) {
    this.db = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async insertReport(r: NewReport & { lat?: number; lng?: number }): Promise<Report> {
    const { data, error } = await this.db
      .from("electricity_reports")
      .insert({ neighbourhood_id: r.areaId, status: r.status, reporter_key: r.reporterId, network_hash: r.networkHash, created_at: r.createdAt, verification: r.verification, comment: r.comment ?? null, lat: r.lat ?? null, lng: r.lng ?? null })
      .select(COLS)
      .single();
    if (error) throw new Error(`insertReport: ${error.message}`);
    return toReport(data as Row);
  }
  async listReports({ since, areaId }: { since: Date; areaId?: string }) {
    let q = this.db.from("electricity_reports").select(COLS).gte("created_at", since.toISOString()).neq("verification", "removed").order("created_at", { ascending: true }).limit(50_000);
    if (areaId) q = q.eq("neighbourhood_id", areaId);
    const { data, error } = await q;
    if (error) throw new Error(`listReports: ${error.message}`);
    return (data as Row[]).map(toReport);
  }
  async reportsByReporter(reporterId: string, since: Date) {
    const { data, error } = await this.db.from("electricity_reports").select(COLS).eq("reporter_key", reporterId).gte("created_at", since.toISOString());
    if (error) throw new Error(`reportsByReporter: ${error.message}`);
    return (data as Row[]).map(toReport);
  }
  async countByNetwork(networkHash: string, since: Date) {
    const { count, error } = await this.db.from("electricity_reports").select("id", { count: "exact", head: true }).eq("network_hash", networkHash).gte("created_at", since.toISOString());
    if (error) throw new Error(`countByNetwork: ${error.message}`);
    return count ?? 0;
  }
}
