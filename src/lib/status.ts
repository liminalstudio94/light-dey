import { STATUS_CONFIG, type StatusConfig } from "./config";
import type { AreaState, AreaStatus, Confidence, Freshness, PowerStatus, Report } from "./types";

const MIN = 60_000;

export function freshnessOf(ageMinutes: number | null, cfg: StatusConfig = STATUS_CONFIG): Freshness {
  if (ageMinutes === null) return "none";
  const f = cfg.freshness;
  if (ageMinutes <= f.freshMaxMinutes) return "fresh";
  if (ageMinutes <= f.recentMaxMinutes) return "recent";
  if (ageMinutes <= f.ageingMaxMinutes) return "ageing";
  return "stale";
}

interface Vote {
  reporterId: string;
  status: PowerStatus;
  at: number;
  locationMatched: boolean;
}

/**
 * Turns raw reports for ONE area into the live status shown to users.
 *
 * Rules (see ARCHITECTURE.md#status-rules):
 * - Only non-removed, non-flagged reports inside the reporting window count.
 * - Each reporter counts once: their latest report in the window.
 * - At most `maxCountedPerNetwork` reporters per hashed network count, so one
 *   phone clearing cookies cannot confirm an area alone.
 * - A side is confirmed when it has >= `confirmationThreshold` distinct reporters.
 *   If both sides are confirmed (power changed inside the window), the side
 *   whose threshold-th most recent vote is newer wins.
 * - Both sides present, neither confirmed => UNCERTAIN.
 * - One side present but below threshold, or no reports => UNKNOWN.
 */
export function aggregateAreaStatus(
  areaId: string,
  reports: Report[],
  now: Date = new Date(),
  cfg: StatusConfig = STATUS_CONFIG,
): AreaStatus {
  const nowMs = now.getTime();
  const since = nowMs - cfg.reportingWindowMinutes * MIN;

  const inWindow = reports.filter((r) => {
    if (r.areaId !== areaId) return false;
    if (r.verification === "removed" || r.verification === "flagged") return false;
    const t = Date.parse(r.createdAt);
    return t > since && t <= nowMs;
  });

  // Latest report per reporter.
  const latest = new Map<string, Report>();
  for (const r of inWindow) {
    const prev = latest.get(r.reporterId);
    if (!prev || Date.parse(r.createdAt) > Date.parse(prev.createdAt)) latest.set(r.reporterId, r);
  }

  // Newest first, then cap per network.
  const perNetwork = new Map<string, number>();
  const votes: Vote[] = [];
  for (const r of [...latest.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))) {
    const n = perNetwork.get(r.networkHash) ?? 0;
    if (n >= cfg.maxCountedPerNetwork) continue;
    perNetwork.set(r.networkHash, n + 1);
    votes.push({ reporterId: r.reporterId, status: r.status, at: Date.parse(r.createdAt), locationMatched: r.verification === "location_matched" });
  }

  const on = votes.filter((v) => v.status === "on");
  const off = votes.filter((v) => v.status === "off");
  const k = cfg.confirmationThreshold;
  const onConfirmed = on.length >= k;
  const offConfirmed = off.length >= k;

  let state: AreaState;
  if (onConfirmed && offConfirmed) {
    // votes are newest-first, so [k-1] is the k-th newest.
    state = on[k - 1].at >= off[k - 1].at ? "LIGHT" : "NO_LIGHT";
  } else if (onConfirmed) state = "LIGHT";
  else if (offConfirmed) state = "NO_LIGHT";
  else if (on.length > 0 && off.length > 0) state = "UNCERTAIN";
  else state = "UNKNOWN";

  const lastAt = inWindow.length ? Math.max(...inWindow.map((r) => Date.parse(r.createdAt))) : null;
  // Freshness should reflect the newest report even if it has aged out of the window.
  const allTimes = reports.filter((r) => r.areaId === areaId && r.verification !== "removed").map((r) => Date.parse(r.createdAt)).filter((t) => t <= nowMs);
  const newestEver = allTimes.length ? Math.max(...allTimes) : null;
  const ageMin = newestEver === null ? null : (nowMs - newestEver) / MIN;
  const freshness = freshnessOf(ageMin, cfg);

  const agreeing = state === "LIGHT" ? on : state === "NO_LIGHT" ? off : [];
  const disagreeing = state === "LIGHT" ? off : state === "NO_LIGHT" ? on : [];

  let confidence: Confidence = "none";
  if (state === "LIGHT" || state === "NO_LIGHT") {
    const newestAgreeAgeMin = (nowMs - agreeing[0].at) / MIN;
    const cleanMajority = disagreeing.length / agreeing.length < 0.2;
    if (agreeing.length >= cfg.highConfidenceReporters && newestAgreeAgeMin <= cfg.freshness.freshMaxMinutes && cleanMajority) confidence = "high";
    else if (newestAgreeAgeMin <= cfg.freshness.recentMaxMinutes && disagreeing.length < agreeing.length) confidence = "medium";
    else confidence = "low";
  } else if (votes.length > 0) {
    confidence = "low";
  }

  let leaning: PowerStatus | null = null;
  if (state === "UNKNOWN" || state === "UNCERTAIN") {
    if (on.length > off.length) leaning = "on";
    else if (off.length > on.length) leaning = "off";
  }

  return {
    areaId,
    state,
    onReporters: on.length,
    offReporters: off.length,
    recentReports: inWindow.length,
    confirmingUsers: agreeing.length,
    lastReportAt: lastAt ? new Date(lastAt).toISOString() : newestEver ? new Date(newestEver).toISOString() : null,
    freshness,
    confidence,
    leaning,
    locationMatchedReports: inWindow.filter((r) => r.verification === "location_matched").length,
  };
}

export function aggregateAll(areaIds: string[], reports: Report[], now = new Date(), cfg: StatusConfig = STATUS_CONFIG) {
  const byArea = new Map<string, Report[]>();
  for (const r of reports) {
    const list = byArea.get(r.areaId);
    if (list) list.push(r);
    else byArea.set(r.areaId, [r]);
  }
  return areaIds.map((id) => aggregateAreaStatus(id, byArea.get(id) ?? [], now, cfg));
}

export const STATE_LABEL: Record<AreaState, string> = {
  LIGHT: "Light dey",
  NO_LIGHT: "No light",
  UNCERTAIN: "Uncertain",
  UNKNOWN: "Unknown",
};
