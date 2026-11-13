import "server-only";
import { ADAPTERS, recomputePatterns, runAdapter, snapshotChanges } from "../ingest/runner";
import { getStore } from "../store";
import { getOverview } from "./data";

/**
 * Runs every adapter that is due, then (hourly) recomputes patterns and
 * records map-state changes. Safe to call often: leases make extra calls no-ops.
 */
export async function refreshDueSources(opts: { force?: boolean } = {}) {
  const store = getStore();
  const now = new Date();
  const runs = [];
  for (const a of ADAPTERS) runs.push(await runAdapter(store, a, { now, force: opts.force }));
  let patterns: number | "skipped" = "skipped";
  if (await store.acquireLease("historical_estimate", opts.force ? 0 : 60, now)) {
    try {
      patterns = await recomputePatterns(store, now);
    } catch (e) {
      console.error("[refresh:patterns]", e);
    }
  }
  const overview = await getOverview(new Date());
  const snapshots = await snapshotChanges(store, overview.statuses);
  return { at: now.toISOString(), runs: runs.map(({ log, ...r }) => ({ ...r, log: log.slice(-4) })), patterns, snapshots, mapCounts: overview.mapCounts };
}
