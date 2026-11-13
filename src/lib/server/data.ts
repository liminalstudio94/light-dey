import "server-only";
import { AREAS } from "../areas";
import { STATUS_CONFIG } from "../config";
import { historyStats } from "../history";
import { aggregateAll } from "../status";
import { getStore } from "../store";
import type { AreaState, Overview } from "../types";

export type { Overview } from "../types";

export async function getOverview(now = new Date()): Promise<Overview> {
  const store = getStore();
  const reports = await store.listReports({ since: new Date(now.getTime() - 24 * 3_600_000) });
  const live = reports.filter((r) => Date.parse(r.createdAt) > now.getTime() - STATUS_CONFIG.reportingWindowMinutes * 60_000);
  const statuses = aggregateAll(AREAS.map((a) => a.id), live, now);
  const counts = { LIGHT: 0, NO_LIGHT: 0, UNCERTAIN: 0, UNKNOWN: 0 } as Record<AreaState, number>;
  for (const s of statuses) counts[s.state]++;
  const visible = reports.filter((r) => r.verification !== "flagged" && r.verification !== "removed");
  return {
    statuses,
    counts,
    recent: visible
      .slice(-12)
      .reverse()
      .map((r) => ({ id: r.id, areaId: r.areaId, status: r.status, createdAt: r.createdAt, locationMatched: r.verification === "location_matched" })),
    reportsLast24h: visible.length,
    reportersLast24h: new Set(visible.map((r) => r.reporterId)).size,
    areasReportedLast24h: new Set(visible.map((r) => r.areaId)).size,
    generatedAt: now.toISOString(),
    storeKind: store.kind,
  };
}

export async function getAreaHistory(areaId: string, days: 7 | 30, now = new Date()) {
  const store = getStore();
  const since = new Date(now.getTime() - (days * 24 + 2) * 3_600_000);
  const reports = await store.listReports({ since, areaId });
  return historyStats(areaId, reports, days, now);
}
