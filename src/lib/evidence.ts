import { getArea } from "./areas";
import { EVIDENCE_CONFIG, LAGOS_UTC_OFFSET_MINUTES, STATUS_CONFIG } from "./config";
import { discoOf, DISCOS } from "./sources/discos";
import { getSource } from "./sources/registry";
import { freshnessOf } from "./status";
import type { AreaState, AreaStatus, Confidence, Estimate, EvidenceItem, HourPattern, MapState, Observation, PowerStatus } from "./types";

const MIN = 60_000;
type Cfg = typeof EVIDENCE_CONFIG;

const ageMin = (iso: string, now: number) => (now - Date.parse(iso)) / MIN;
/** Public label. Partner / verified-reporter source ids are internal (they can name a person), so never show them. */
export const sourceName = (o: Pick<Observation, "sourceId" | "tier">) =>
  getSource(o.sourceId)?.shortName ?? (o.tier === 2 ? "Verified reporter" : o.tier === 1 ? "Approved partner" : "Other source");
const K = () => STATUS_CONFIG.confirmationThreshold;
/** Public id for an evidence item: per-partner / per-reporter source ids stay server-side. */
const publicSourceId = (o: Pick<Observation, "sourceId" | "tier">) => (getSource(o.sourceId) ? o.sourceId : o.tier === 2 ? "verified_reporters" : "partner_feed");

/** Is this observation usable right now? Checks both its own expiry and our max age, and rejects future timestamps. */
export function isActive(o: Observation, now: number, cfg: Cfg = EVIDENCE_CONFIG): boolean {
  const t = Date.parse(o.observedAt);
  if (!(t <= now + 2 * MIN) || now > Date.parse(o.validUntil)) return false;
  const maxAge = o.kind === "notice" ? cfg.noticeMaxAgeDays * 1440 : o.kind === "status_report" ? cfg.partnerMaxAgeMinutes : cfg.officialMaxAgeMinutes;
  return (now - t) / MIN <= maxAge;
}

/** Does an observation apply to this area? DisCo-scoped evidence only reaches officially mapped areas. */
export function appliesTo(o: Observation, areaId: string): boolean {
  if (o.kind === "notice") return o.neighbourhoodIds.includes(areaId); // notices attach only to areas they name
  if (o.scope === "national") return getArea(areaId)?.state === "Lagos";
  if (o.scope === "disco") return discoOf(areaId)?.disco === o.scopeRef;
  return o.scopeRef === areaId || o.neighbourhoodIds.includes(areaId);
}

/**
 * Grid figures assert an outage only by their value, never by a stored flag:
 * national total <= gridCollapseMaxMw or DisCo <= discoOutageMaxMw => "off";
 * anything else is context (null). Grid data never asserts "on".
 */
export function normalizeGrid(o: Observation, cfg: Cfg = EVIDENCE_CONFIG): Observation {
  if (o.kind !== "grid_total" && o.kind !== "disco_allocation") return o;
  const limit = o.kind === "grid_total" ? cfg.gridCollapseMaxMw : cfg.discoOutageMaxMw;
  const status = o.valueNum !== null && Number.isFinite(o.valueNum) && o.valueNum >= 0 && o.valueNum <= limit ? "off" : null;
  return status === o.status ? o : { ...o, status };
}

/**
 * Keeps only the newest reading of each thing a source measures (a DisCo, the
 * national total, one partner's report for one area). A newer positive reading
 * therefore supersedes an older outage. Notices are independent items and all kept.
 */
export function latestPerMeasure(observations: Observation[]): Observation[] {
  const latest = new Map<string, Observation>();
  const notices: Observation[] = [];
  for (const o of observations) {
    if (o.kind === "notice") {
      notices.push(o);
      continue;
    }
    const key = `${o.sourceId}|${o.kind}|${o.scope}|${o.scopeRef ?? ""}`;
    const prev = latest.get(key);
    if (!prev || Date.parse(o.observedAt) > Date.parse(prev.observedAt)) latest.set(key, o);
  }
  return [...latest.values(), ...notices];
}

export function lagosHour(now: number): number {
  return new Date(now + LAGOS_UTC_OFFSET_MINUTES * MIN).getUTCHours();
}

export function estimateFrom(pattern: HourPattern | null | undefined, cfg: Cfg = EVIDENCE_CONFIG): Estimate | null {
  if (!pattern || pattern.knownHours < cfg.estimate.minSamples) return null;
  const p = pattern.lightHours / pattern.knownHours;
  if (p >= cfg.estimate.minProbability) return { status: "on", probability: p, samples: pattern.knownHours, hour: pattern.hour };
  if (1 - p >= cfg.estimate.minProbability) return { status: "off", probability: 1 - p, samples: pattern.knownHours, hour: pattern.hour };
  return null;
}

export const LEGACY_STATE: Record<MapState, AreaState> = {
  CONFIRMED_ON: "LIGHT",
  COMMUNITY_ON: "LIGHT",
  CONFIRMED_OFF: "NO_LIGHT",
  COMMUNITY_OFF: "NO_LIGHT",
  CONFLICTING: "UNCERTAIN",
  ESTIMATED_ON: "UNKNOWN",
  ESTIMATED_OFF: "UNKNOWN",
  UNKNOWN: "UNKNOWN",
};

const word = (s: PowerStatus) => (s === "on" ? "light dey" : "no light");

function officialSummary(o: Observation): string {
  if (o.kind === "grid_total") return `National grid collapse: total DisCo allocation ${Math.round(o.valueNum ?? 0)} MW`;
  if (o.kind === "disco_allocation") {
    const d = DISCOS[o.scopeRef as keyof typeof DISCOS];
    return `${d?.name ?? o.scopeRef} allocated ${Math.round(o.valueNum ?? 0)} MW from the grid — no grid supply`;
  }
  return `${o.title ?? "Official report"}: ${o.status ? word(o.status) : "notice"}`;
}

export interface EvidenceInput {
  /** Community-only status from aggregateAreaStatus(). */
  community: AreaStatus;
  observations: Observation[];
  pattern?: HourPattern | null;
  now?: Date;
  cfg?: Cfg;
}

/**
 * Combines independent evidence for one area into a single, explainable map state.
 *
 * Precedence (highest first), each only if fresh:
 *  1. Official evidence (tier 1): grid collapse, a mapped DisCo at ~0 MW, or an
 *     approved official partner's neighbourhood report => CONFIRMED_*.
 *     Opposing official evidence => CONFLICTING.
 *  2. Verified reporters (tier 2; one source per vetted person): 2+ agreeing,
 *     or 1 agreeing with a community-confirmed status => CONFIRMED_*. A lone
 *     verified report is not confirmation: UNKNOWN with the reason. Disagreement => CONFLICTING.
 *  3. Community (tier 3): 3+ independent reporters => COMMUNITY_*; mixed => CONFLICTING.
 *  4. History (tier 4), only when there are no fresh reports at all => ESTIMATED_* (never live).
 *  5. Otherwise UNKNOWN, with the reason.
 */
export function resolveAreaStatus({ community, observations, pattern, now: nowDate = new Date(), cfg = EVIDENCE_CONFIG }: EvidenceInput): AreaStatus {
  const now = nowDate.getTime();
  const areaId = community.areaId;
  const area = getArea(areaId);
  // Newest reading per measure first (so recoveries supersede outages), then scope and freshness.
  // Future-dated readings can't supersede real ones, so drop them before picking the newest.
  const plausible = observations.filter((o) => Date.parse(o.observedAt) <= now + 2 * MIN);
  const relevant = latestPerMeasure(plausible.map((o) => normalizeGrid(o, cfg))).filter((o) => appliesTo(o, areaId) && isActive(o, now, cfg));
  const evidence: EvidenceItem[] = [];

  const item = (o: Observation, role: EvidenceItem["role"], summary = officialSummary(o)): EvidenceItem => ({
    sourceId: publicSourceId(o),
    sourceName: sourceName(o),
    tier: o.tier,
    role,
    status: o.status,
    summary,
    count: 1,
    observedAt: o.observedAt,
    freshness: freshnessOf(ageMin(o.observedAt, now), STATUS_CONFIG),
    url: o.url,
  });

  // Context that never sets status: positive DisCo allocations and notices.
  const context: EvidenceItem[] = [];
  for (const o of relevant) {
    if (o.kind === "disco_allocation" && o.status === null) {
      const d = DISCOS[o.scopeRef as keyof typeof DISCOS];
      context.push(item(o, "context", `${d?.name ?? o.scopeRef} is receiving ${Math.round(o.valueNum ?? 0)} MW from the national grid. That doesn't mean every feeder in ${area?.name ?? "this area"} has light (load shedding).`));
    } else if (o.kind === "notice") {
      context.push(item(o, "context", `Official notice: ${o.title ?? "see link"}`));
    }
  }

  const communityItem = (role: EvidenceItem["role"]): EvidenceItem | null => {
    if (community.recentReports === 0) return null;
    const s: PowerStatus | null = community.state === "LIGHT" ? "on" : community.state === "NO_LIGHT" ? "off" : community.leaning;
    return {
      sourceId: "community",
      sourceName: "Community reports",
      tier: 3,
      role,
      status: s,
      summary: `${community.onReporters} say light dey, ${community.offReporters} say no light (independent reporters, last hour)`,
      count: community.onReporters + community.offReporters,
      observedAt: community.lastReportAt,
      freshness: community.freshness,
      url: null,
    };
  };
  const communityConfirmed: PowerStatus | null = community.state === "LIGHT" ? "on" : community.state === "NO_LIGHT" ? "off" : null;

  const finish = (mapState: MapState, confidence: Confidence, explanation: string, estimate: Estimate | null = null): AreaStatus => ({
    ...community,
    state: LEGACY_STATE[mapState],
    confidence,
    mapState,
    evidence: [...evidence, ...context],
    explanation,
    estimate,
    disco: discoOf(areaId)?.disco ?? null,
  });

  // 1. Official
  const official = relevant.filter((o) => o.tier === 1 && o.status !== null && o.kind !== "notice").sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt));
  if (official.length) {
    const offs = official.filter((o) => o.status === "off");
    const ons = official.filter((o) => o.status === "on");
    if (offs.length && ons.length) {
      official.forEach((o) => evidence.push(item(o, "conflicting")));
      const c = communityItem("supporting");
      if (c) evidence.push(c);
      return finish("CONFLICTING", "low", "Official sources disagree right now.");
    }
    const s = official[0].status as PowerStatus;
    official.forEach((o, i) => evidence.push(item(o, i === 0 ? "decisive" : "supporting")));
    const c = communityItem(communityConfirmed && communityConfirmed !== s ? "conflicting" : "supporting");
    if (c) evidence.push(c);
    const contradicted = communityConfirmed !== null && communityConfirmed !== s;
    return finish(
      s === "on" ? "CONFIRMED_ON" : "CONFIRMED_OFF",
      contradicted ? "medium" : "high",
      contradicted
        ? `Official data says ${word(s)}, but neighbours report ${word(communityConfirmed!)} — some may be on generator/solar or a separate supply.`
        : `Official data: ${word(s)}.${s === "off" && official[0].scope !== "neighbourhood" ? " Applies to grid supply; private or embedded generation isn't covered." : ""}`,
    );
  }

  // 2. Verified reporters (tier 2). Each vetted person is their own source (scripts/partner-key.mjs
  //    issues one source per reporter), and relevant already holds only their latest report here.
  const verified = relevant.filter((x) => x.tier === 2 && x.kind === "status_report" && x.status);
  const vOn = verified.filter((o) => o.status === "on");
  const vOff = verified.filter((o) => o.status === "off");
  if (verified.length) {
    const agreeWith = (s: PowerStatus) => (s === "on" ? vOn : vOff);
    if (vOn.length && vOff.length) {
      verified.forEach((o) => evidence.push(item(o, "conflicting", `Verified reporter: ${word(o.status!)}`)));
      const c = communityItem("supporting");
      if (c) evidence.push(c);
      return finish("CONFLICTING", "low", "Verified reporters disagree.");
    }
    const s: PowerStatus = vOn.length ? "on" : "off";
    const agree = agreeWith(s);
    if (communityConfirmed && communityConfirmed !== s) {
      agree.forEach((o) => evidence.push(item(o, "conflicting", `Verified reporter: ${word(s)}`)));
      evidence.push(communityItem("conflicting")!);
      return finish("CONFLICTING", "low", "Verified reporters and neighbours disagree.");
    }
    agree.forEach((o) => evidence.push(item(o, agree.length >= cfg.verifiedConfirmCount || communityConfirmed === s ? "decisive" : "supporting", `Verified reporter: ${word(s)}`)));
    const c = communityItem("supporting");
    if (c) evidence.push(c);
    if (agree.length >= cfg.verifiedConfirmCount || communityConfirmed === s) {
      return finish(s === "on" ? "CONFIRMED_ON" : "CONFIRMED_OFF", agree.length >= cfg.verifiedConfirmCount && communityConfirmed === s ? "high" : "medium", `Confirmed by ${agree.length} verified reporter${agree.length > 1 ? "s" : ""}${communityConfirmed === s ? " and neighbours" : ""}.`);
    }
    // A single report — even a verified one — is never shown as an established status.
    if (community.state === "UNCERTAIN") return finish("CONFLICTING", "low", "Recent reports disagree.");
    return finish("UNKNOWN", "low", `Not enough verified data: 1 verified reporter says ${word(s)}. A second verified reporter or ${K()} neighbours would confirm it.`);
  }

  // 3. Community
  if (community.state === "LIGHT" || community.state === "NO_LIGHT") {
    evidence.push(communityItem("decisive")!);
    return finish(community.state === "LIGHT" ? "COMMUNITY_ON" : "COMMUNITY_OFF", community.confidence, `${community.confirmingUsers} neighbours independently reported ${word(communityConfirmed!)} in the last hour. Not officially confirmed.`);
  }
  if (community.state === "UNCERTAIN") {
    evidence.push(communityItem("conflicting")!);
    return finish("CONFLICTING", "low", `Recent reports disagree and neither side has ${K()} independent confirmations.`);
  }

  // 4. Estimate from history — only when there are no fresh reports at all, so history never overrides what neighbours say now.
  const est = community.recentReports === 0 ? estimateFrom(pattern, cfg) : null;
  const pending = communityItem("supporting");
  if (pending) evidence.push(pending);
  if (est) {
    evidence.push({
      sourceId: "historical_estimate",
      sourceName: "Estimate from history",
      tier: 4,
      role: "estimate",
      status: est.status,
      summary: `${Math.round(est.probability * 100)}% of ${est.samples} past confirmed hours around this time had ${word(est.status)}`,
      count: est.samples,
      observedAt: null,
      freshness: "none",
      url: null,
    });
    return finish(est.status === "on" ? "ESTIMATED_ON" : "ESTIMATED_OFF", "low", "Estimate from past reports only — not live. Report what you see to make it live.", est);
  }

  // 5. Unknown, with the reason.
  const why =
    community.recentReports > 0
      ? `Not enough verified data: ${community.leaning ? `${community.leaning === "on" ? community.onReporters : community.offReporters} of ${K()} needed people say ${word(community.leaning)}` : "recent reports don't agree yet"}.`
      : community.freshness === "stale"
        ? "Not enough verified data: the last reports are over an hour old, so they no longer count as live."
        : "Not enough verified data: no recent reports and no official outage data for this area.";
  return finish("UNKNOWN", community.recentReports > 0 ? "low" : "none", why);
}

/** Latest NISO figures for the Lagos DisCos + national total, or null if stale/missing. */
export function gridContextFrom(observations: Observation[], now: Date = new Date(), cfg: Cfg = EVIDENCE_CONFIG): import("./types").GridContext | null {
  const t = now.getTime();
  const fresh = observations.filter((o) => o.sourceId === "niso_niggrid" && (o.kind === "disco_allocation" || o.kind === "grid_total") && isActive(o, t, cfg));
  if (!fresh.length) return null;
  const latest = (pred: (o: Observation) => boolean) => fresh.filter(pred).sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0];
  const total = latest((o) => o.kind === "grid_total");
  const discos = (Object.keys(DISCOS) as (keyof typeof DISCOS)[])
    .map((id) => ({ id, o: latest((o) => o.kind === "disco_allocation" && o.scopeRef === id) }))
    .filter((d) => d.o)
    .map((d) => ({ id: d.id, name: DISCOS[d.id].name, mw: d.o!.valueNum ?? 0 }));
  const asOf = [total, ...fresh].filter(Boolean).map((o) => o!.observedAt).sort().at(-1)!;
  return {
    asOf,
    totalMw: total?.valueNum ?? null,
    discos,
    sourceUrl: getSource("niso_niggrid")?.url ?? "https://www.niggrid.org/",
    collapse: total?.status === "off",
  };
}
