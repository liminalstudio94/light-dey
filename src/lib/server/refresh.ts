import "server-only";
import { ADAPTERS, recomputePatterns, runAdapter, snapshotChanges } from "../ingest/runner";
import { getStore } from "../store";
import { getOverview } from "./data";

/**
 * Runs every due adapter (in parallel — they hit different hosts), then (hourly)
 * recomputes patterns and records map-state changes. Safe to call often: leases make
 * extra calls no-ops. `snapshot: "if-changed"` (the opportunistic path) skips the
 * overview + snapshot work entirely unless an adapter actually ran.
 */
/**
 * Records changed map states at most every `minutes` (shared lease), so sensor-driven changes —
 * a new heartbeat, or a sensor going stale/offline — reach the timeline even when no source adapter runs.
 */
export async function snapshotIfDue(minutes = 2): Promise<number | "skipped"> {
  const store = getStore();
  const now = new Date();
  if (!(await store.acquireLease("light_dey_sensor", minutes, now, { runningMinutes: 1 }))) return "skipped";
  try {
    const overview = await getOverview(new Date());
    return await snapshotChanges(store, overview.statuses);
  } finally {
    await store.releaseLease("light_dey_sensor").catch(() => {});
  }
}

export async function refreshDueSources(opts: { force?: boolean; snapshot?: "always" | "if-changed" } = {}) {
  const store = getStore();
  const now = new Date();
  const runs = await Promise.all(ADAPTERS.map((a) => runAdapter(store, a, { now, force: opts.force })));
  let patterns: number | "skipped" | "error" = "skipped";
  if (await store.acquireLease("historical_estimate", 60, now, { force: opts.force, runningMinutes: 2 })) {
    try {
      patterns = await recomputePatterns(store, now);
    } catch (e) {
      patterns = "error";
      console.error("[refresh:patterns]", e);
    } finally {
      await store.releaseLease("historical_estimate").catch(() => {});
    }
  }
  // Housekeeping for sensor replay/rate data (cheap; bounded tables).
  await store.pruneSensorData(now).catch((e) => console.error("[refresh:prune]", e));
  const anyRan = runs.some((r) => r.status !== "skipped") || patterns !== "skipped";
  const errors = runs.filter((r) => r.status === "error").length + (patterns === "error" ? 1 : 0);
  const summary = { at: now.toISOString(), errors, runs: runs.map(({ log, ...r }) => ({ ...r, log: log.slice(-4) })), patterns };
  if (opts.snapshot === "if-changed" && !anyRan) {
    // Nothing fetched, but sensor states age on their own: snapshot on a short shared lease.
    const snapshots = await snapshotIfDue().catch(() => "skipped" as const);
    return { ...summary, snapshots: snapshots === "skipped" ? 0 : snapshots, mapCounts: null };
  }
  const overview = await getOverview(new Date());
  const snapshots = await snapshotChanges(store, overview.statuses);
  return { ...summary, snapshots, mapCounts: overview.mapCounts };
}
