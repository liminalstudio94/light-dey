import { AREAS } from "../areas";
import { EVIDENCE_CONFIG } from "../config";
import { historyStats } from "../history";
import type { DataStore, NewObservation, RunResult } from "../store/types";
import type { AreaStatus, HourPattern } from "../types";
import { defaultFetcher, fetchWithRetry, RetryError, type Fetcher } from "./http";
import { IKEJA_FEED_URL, noticeObservations, parseRss } from "./ikejaNotices";
import { NIGGRID_DISCO_URL, niggridObservations, parseDiscoLoadProfile } from "./niggrid";

export interface Adapter {
  sourceId: string;
  /** Minimum minutes between runs (also the rate limit toward the source). */
  everyMinutes: number;
  enabledEnv: string;
  fetchObservations(fetcher: Fetcher, now: Date, log: string[]): Promise<{ observations: NewObservation[]; fetched: number; attempts: number }>;
}

/** Each adapter must finish well inside the 60 s function limit; adapters run in parallel. */
export const ADAPTER_BUDGET_MS = 30_000;

/** Adapters exist only for sources we verified are publicly accessible. See SOURCES.md. */
export const ADAPTERS: Adapter[] = [
  {
    sourceId: "niso_niggrid",
    everyMinutes: 10,
    enabledEnv: "SOURCE_NISO_ENABLED",
    async fetchObservations(fetcher, now, log) {
      const { text, attempts } = await fetchWithRetry(fetcher, NIGGRID_DISCO_URL, log, { deadline: Date.now() + ADAPTER_BUDGET_MS });
      const profile = parseDiscoLoadProfile(text, now);
      log.push(`as at ${profile.asOf}; total ${profile.totalMw} MW; ${profile.rows.length} DisCos`);
      return { observations: niggridObservations(profile), fetched: profile.rows.length, attempts };
    },
  },
  {
    sourceId: "ikeja_electric_notices",
    everyMinutes: 60, // robots.txt asks for a 10s crawl delay; hourly is far gentler
    enabledEnv: "SOURCE_IKEJA_NOTICES_ENABLED",
    async fetchObservations(fetcher, now, log) {
      const { text, attempts } = await fetchWithRetry(fetcher, IKEJA_FEED_URL, log, { deadline: Date.now() + ADAPTER_BUDGET_MS });
      const items = parseRss(text);
      const observations = noticeObservations(items, now);
      log.push(`${items.length} items; ${observations.length} recent notices name a supported area`);
      return { observations, fetched: items.length, attempts };
    },
  },
];

const enabled = (a: Adapter) => process.env[a.enabledEnv] !== "0";

/**
 * Runs one adapter if its lease is free. Never throws: failures are logged to
 * source_runs and the previous observations simply expire on their own.
 */
export async function runAdapter(store: DataStore, a: Adapter, opts: { now?: Date; fetcher?: Fetcher; force?: boolean } = {}): Promise<RunResult & { sourceId: string }> {
  const now = opts.now ?? new Date();
  const log: string[] = [];
  if (!enabled(a)) return { sourceId: a.sourceId, status: "skipped", attempts: 0, itemsFetched: 0, itemsWritten: 0, log: [`disabled via ${a.enabledEnv}=0`] };
  // force skips the interval but never the running lock, so a source is never fetched twice at once.
  if (!(await store.acquireLease(a.sourceId, a.everyMinutes, now, { force: opts.force, runningMinutes: 2 }))) {
    return { sourceId: a.sourceId, status: "skipped", attempts: 0, itemsFetched: 0, itemsWritten: 0, log: ["not due yet, or another run is in progress"] };
  }
  let result: RunResult;
  try {
    const { observations, fetched, attempts } = await a.fetchObservations(opts.fetcher ?? defaultFetcher, now, log);
    const written = await store.upsertObservations(observations);
    log.push(`${written} observation(s) new or changed of ${observations.length}`);
    result = { status: "ok", attempts, itemsFetched: fetched, itemsWritten: written, log };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.push(`error: ${msg}`);
    result = { status: "error", attempts: e instanceof RetryError ? e.attempts : 1, itemsFetched: 0, itemsWritten: 0, error: msg, log };
    console.error(`[ingest:${a.sourceId}]`, msg);
  }
  try {
    await store.recordRun(a.sourceId, now, result);
  } catch (e) {
    console.error(`[ingest:${a.sourceId}] could not record run`, e);
  }
  try {
    await store.releaseLease(a.sourceId);
  } catch (e) {
    console.error(`[ingest:${a.sourceId}] could not release lease (expires on its own)`, e);
  }
  return { sourceId: a.sourceId, ...result };
}

/** Hour-of-day patterns from confirmed community history (for labelled estimates). */
export async function recomputePatterns(store: DataStore, now: Date = new Date()): Promise<number> {
  const days = EVIDENCE_CONFIG.estimate.windowDays;
  const reports = await store.listReports({ since: new Date(now.getTime() - (days * 24 + 2) * 3_600_000) });
  const rows: HourPattern[] = [];
  for (const area of AREAS) {
    const mine = reports.filter((r) => r.areaId === area.id);
    if (!mine.length) continue;
    for (const h of historyStats(area.id, mine, days, now).byHour) {
      if (h.samples > 0) rows.push({ areaId: area.id, hour: h.hour, knownHours: h.samples, lightHours: Math.round(((h.lightPct ?? 0) * h.samples) / 100) });
    }
  }
  await store.replaceHourPatterns(rows, days);
  return rows.length;
}

/** Appends a snapshot for each area whose map state changed since the last snapshot (atomic in the store). */
export async function snapshotChanges(store: DataStore, statuses: AreaStatus[]): Promise<number> {
  return store.recordSnapshotChanges(
    statuses.filter((s) => s.mapState).map((s) => ({ areaId: s.areaId, mapState: s.mapState!, confidence: s.confidence, freshness: s.freshness, evidence: s.evidence ?? [] })),
  );
}
