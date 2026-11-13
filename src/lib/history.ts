import { LAGOS_UTC_OFFSET_MINUTES, STATUS_CONFIG, type StatusConfig } from "./config";
import { aggregateAreaStatus } from "./status";
import type { AreaState, Report } from "./types";

const HOUR = 3_600_000;

export interface HourSample {
  at: string; // ISO, top of the hour (UTC)
  state: AreaState;
}

export interface DaySummary {
  date: string; // YYYY-MM-DD in Lagos time
  lightHours: number;
  noLightHours: number;
  unknownHours: number; // UNKNOWN or UNCERTAIN
}

export interface HistoryStats {
  days: number;
  samples: HourSample[];
  daily: DaySummary[];
  outages: number;
  lightPeriods: number;
  /** % of hours with a confirmed status. Low coverage => low accuracy. */
  coveragePct: number;
  /** % of confirmed hours that were LIGHT. null if nothing confirmed. */
  availabilityPct: number | null;
  avgDailyLightHours: number | null;
  avgOutageHours: number | null;
  /** 0-100, availability weighted by how much data backs it. null if no data. */
  reliabilityScore: number | null;
  byHour: { hour: number; lightPct: number | null; samples: number }[];
  byWeekday: { day: number; lightPct: number | null; samples: number }[];
  bestHours: number[];
  worstHours: number[];
}

function lagosParts(ms: number) {
  const d = new Date(ms + LAGOS_UTC_OFFSET_MINUTES * 60_000);
  return { hour: d.getUTCHours(), weekday: d.getUTCDay(), date: d.toISOString().slice(0, 10) };
}

const SUB_SAMPLES_PER_HOUR = 6; // every 10 minutes

/**
 * Rebuilds hourly status by replaying the live aggregation rule every 10
 * minutes, using only reports that existed at that moment. An hour is LIGHT or
 * NO_LIGHT if that state was confirmed at some check in the hour (majority if
 * both were); otherwise UNKNOWN. Everything is derived from stored reports —
 * nothing is estimated or carried forward.
 */
export function hourlySamples(areaId: string, reports: Report[], days: number, now = new Date(), cfg: StatusConfig = STATUS_CONFIG): HourSample[] {
  const end = Math.floor(now.getTime() / HOUR) * HOUR;
  const start = end - days * 24 * HOUR;
  const relevant = reports
    .filter((r) => r.areaId === areaId && r.verification !== "removed" && r.verification !== "flagged")
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const windowMs = cfg.reportingWindowMinutes * 60_000;
  const step = HOUR / SUB_SAMPLES_PER_HOUR;
  const out: HourSample[] = [];
  let lo = 0;
  let hi = 0;
  for (let h = start; h < end; h += HOUR) {
    let light = 0;
    let dark = 0;
    for (let t = h + step; t <= h + HOUR; t += step) {
      while (hi < relevant.length && Date.parse(relevant[hi].createdAt) <= t) hi++;
      while (lo < hi && Date.parse(relevant[lo].createdAt) <= t - windowMs) lo++;
      if (hi - lo < cfg.confirmationThreshold) continue;
      const st = aggregateAreaStatus(areaId, relevant.slice(lo, hi), new Date(t), cfg).state;
      if (st === "LIGHT") light++;
      else if (st === "NO_LIGHT") dark++;
    }
    const state: AreaState = light === 0 && dark === 0 ? "UNKNOWN" : light >= dark ? "LIGHT" : "NO_LIGHT";
    out.push({ at: new Date(h + HOUR).toISOString(), state });
  }
  return out;
}

function runs(samples: HourSample[], state: AreaState): number[] {
  const lengths: number[] = [];
  let cur = 0;
  for (const s of samples) {
    if (s.state === state) cur++;
    else if (cur) {
      lengths.push(cur);
      cur = 0;
    }
  }
  if (cur) lengths.push(cur);
  return lengths;
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);

export function historyStats(areaId: string, reports: Report[], days: number, now = new Date(), cfg: StatusConfig = STATUS_CONFIG): HistoryStats {
  const samples = hourlySamples(areaId, reports, days, now, cfg);
  const light = samples.filter((s) => s.state === "LIGHT").length;
  const dark = samples.filter((s) => s.state === "NO_LIGHT").length;
  const known = light + dark;

  const dayMap = new Map<string, DaySummary>();
  const hourAgg = Array.from({ length: 24 }, () => ({ l: 0, n: 0 }));
  const dayAgg = Array.from({ length: 7 }, () => ({ l: 0, n: 0 }));
  for (const s of samples) {
    // Attribute each sample to the hour that just ended.
    const p = lagosParts(Date.parse(s.at) - 1);
    const d = dayMap.get(p.date) ?? { date: p.date, lightHours: 0, noLightHours: 0, unknownHours: 0 };
    if (s.state === "LIGHT") d.lightHours++;
    else if (s.state === "NO_LIGHT") d.noLightHours++;
    else d.unknownHours++;
    dayMap.set(p.date, d);
    if (s.state === "LIGHT" || s.state === "NO_LIGHT") {
      hourAgg[p.hour].n++;
      dayAgg[p.weekday].n++;
      if (s.state === "LIGHT") {
        hourAgg[p.hour].l++;
        dayAgg[p.weekday].l++;
      }
    }
  }

  const outageRuns = runs(samples, "NO_LIGHT");
  const lightRuns = runs(samples, "LIGHT");
  const coveragePct = pct(known, samples.length) ?? 0;
  const availabilityPct = pct(light, known);

  const byHour = hourAgg.map((h, hour) => ({ hour, lightPct: pct(h.l, h.n), samples: h.n }));
  const MIN_SAMPLES = 3;
  const ranked = byHour.filter((h) => h.samples >= MIN_SAMPLES && h.lightPct !== null);
  const bestHours = [...ranked].sort((a, b) => b.lightPct! - a.lightPct!).filter((h) => h.lightPct! >= 50).slice(0, 3).map((h) => h.hour);
  const worstHours = [...ranked].sort((a, b) => a.lightPct! - b.lightPct!).filter((h) => h.lightPct! < 50).slice(0, 3).map((h) => h.hour);

  return {
    days,
    samples,
    daily: [...dayMap.values()],
    outages: outageRuns.length,
    lightPeriods: lightRuns.length,
    coveragePct,
    availabilityPct,
    avgDailyLightHours: known ? Math.round((light / days) * 10) / 10 : null,
    avgOutageHours: outageRuns.length ? Math.round((outageRuns.reduce((a, b) => a + b, 0) / outageRuns.length) * 10) / 10 : null,
    reliabilityScore: availabilityPct === null ? null : Math.round(availabilityPct * Math.min(1, coveragePct / 50)),
    byHour,
    byWeekday: dayAgg.map((d, day) => ({ day, lightPct: pct(d.l, d.n), samples: d.n })),
    bestHours,
    worstHours,
  };
}
