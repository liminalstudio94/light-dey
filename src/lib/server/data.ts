import "server-only";
import { AREAS } from "../areas";
import { gridContextFrom, lagosHour, resolveAreaStatus } from "../evidence";
import { historyStats } from "../history";
import { aggregateAll } from "../status";
import { isSourceEnabled } from "../ingest/switches";
import { getStore } from "../store";
import type { AreaState, MapState, Overview } from "../types";

export const MAP_STATES: MapState[] = ["CONFIRMED_ON", "COMMUNITY_ON", "CONFIRMED_OFF", "COMMUNITY_OFF", "CONFLICTING", "ESTIMATED_ON", "ESTIMATED_OFF", "UNKNOWN"];

export type { Overview } from "../types";

/**
 * If this version is deployed before its evidence migration (missing table/column),
 * keep serving community-only statuses instead of failing every page. Other errors still throw.
 */
export async function evidenceOrEmpty<T>(p: Promise<T[]>, what: string): Promise<T[]> {
  try {
    return await p;
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "42P01" || code === "42703") {
      console.error(`[overview] ${what} unavailable (${code}); run \`npm run db:migrate\`. Serving community-only status.`);
      return [];
    }
    throw e;
  }
}

export async function getOverview(now = new Date()): Promise<Overview> {
  const store = getStore();
  const [reports, stored, patterns] = await Promise.all([
    store.listReports({ since: new Date(now.getTime() - 24 * 3_600_000) }),
    evidenceOrEmpty(store.listObservations(now), "observations"),
    evidenceOrEmpty(store.listHourPatterns(lagosHour(now.getTime())), "hourly_patterns"),
  ]);
  // A switched-off source stops counting immediately, not just when its readings expire.
  const observations = stored.filter((o) => isSourceEnabled(o.sourceId));
  const patternByArea = new Map(patterns.map((p) => [p.areaId, p]));
  // Community-only status first (all 24h reports so staleness can be explained), then combine with other evidence.
  const statuses = aggregateAll(AREAS.map((a) => a.id), reports, now).map((community) =>
    resolveAreaStatus({ community, observations, pattern: patternByArea.get(community.areaId), now }),
  );
  const counts = { LIGHT: 0, NO_LIGHT: 0, UNCERTAIN: 0, UNKNOWN: 0 } as Record<AreaState, number>;
  const mapCounts = Object.fromEntries(MAP_STATES.map((m) => [m, 0])) as Record<MapState, number>;
  for (const s of statuses) {
    counts[s.state]++;
    mapCounts[s.mapState!]++;
  }
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
    mapCounts,
    grid: gridContextFrom(observations, now),
  };
}

export async function getAreaHistory(areaId: string, days: 7 | 30, now = new Date()) {
  const store = getStore();
  const since = new Date(now.getTime() - (days * 24 + 2) * 3_600_000);
  const reports = await store.listReports({ since, areaId });
  return historyStats(areaId, reports, days, now);
}
