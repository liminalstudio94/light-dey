import { getArea } from "./areas";
import { EVIDENCE_CONFIG, LAGOS_UTC_OFFSET_MINUTES, SENSOR_CONFIG, STATUS_CONFIG } from "./config";
import { discoOf, DISCOS } from "./sources/discos";
import { getSource } from "./sources/registry";
import { freshnessOf } from "./status";
import type { AreaState, AreaStatus, Confidence, Estimate, EvidenceItem, HourPattern, MapState, Observation, PowerStatus, SensorState } from "./types";

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

export function estimateFrom(pattern: HourPattern | null | undefined, cfg: Cfg = EVIDENCE_CONFIG, now: number = Date.now()): Estimate | null {
  if (!pattern || pattern.knownHours < cfg.estimate.minSamples) return null;
  // A pattern only counts while its refresh job keeps it current; old history must not keep predicting.
  if (!pattern.computedAt || now - Date.parse(pattern.computedAt) > cfg.estimate.patternMaxAgeHours * 3_600_000) return null;
  const p = pattern.lightHours / pattern.knownHours;
  if (p >= cfg.estimate.minProbability) return { status: "on", probability: p, samples: pattern.knownHours, hour: pattern.hour };
  if (1 - p >= cfg.estimate.minProbability) return { status: "off", probability: 1 - p, samples: pattern.knownHours, hour: pattern.hour };
  return null;
}

export const LEGACY_STATE: Record<MapState, AreaState> = {
  LIKELY_ON: "LIGHT",
  LIKELY_OFF: "NO_LIGHT",
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
  /** Latest state of every sensor (all areas); filtered to this area here. */
  sensors?: SensorState[];
  pattern?: HourPattern | null;
  now?: Date;
  cfg?: Cfg;
}

/** Official = tier-1 claim from an official source kind (grid operator, DisCo, regulator). Human partners are reports. */
const OFFICIAL_KINDS = new Set(["official_grid", "official_disco", "regulator"]);
export function isOfficialClaim(o: Observation): boolean {
  const kind = o.sourceKind ?? getSource(o.sourceId)?.kind;
  return o.tier === 1 && !!kind && OFFICIAL_KINDS.has(kind) && o.status !== null && o.kind !== "notice";
}

const SUPPLY_LABEL: Record<SensorState["supplyPoint"], string> = {
  grid_direct: "wired before any generator changeover",
  after_changeover: "after the generator changeover",
  unknown: "wiring not confirmed",
};

/**
 * Combines independent evidence for one area into one explainable map state.
 *
 *  1. CONFIRMED_*  — strong evidence: fresh official status claims (grid collapse, a mapped
 *     DisCo at ~0 MW, an official DisCo partner) and/or MEASURED telemetry (a healthy, fresh,
 *     grid-direct sensor). Independent sensors = distinct networks. Strong sources that
 *     disagree => CONFLICTING.
 *  2. LIKELY_*     — independent but indirect evidence: degraded/late sensors, sensors behind a
 *     generator changeover reporting no mains, or 2+ verified reporters (or 1 verified + 3
 *     neighbours) agreeing.
 *  3. COMMUNITY_*  — reports: 3+ independent neighbours, or 1 fresh verified reporter. Never "confirmed".
 *  4. ESTIMATED_*  — history only, when there are no fresh reports or sensor readings.
 *  5. UNKNOWN      — "Not enough current evidence", with the reason.
 *
 * Sensor silence is never an outage. A device on generator/UPS/solar is not grid evidence.
 */
export function resolveAreaStatus({ community, observations, sensors = [], pattern, now: nowDate = new Date(), cfg = EVIDENCE_CONFIG }: EvidenceInput): AreaStatus {
  const now = nowDate.getTime();
  const areaId = community.areaId;
  const area = getArea(areaId);
  // Future-dated readings can't supersede real ones, so drop them before picking the newest.
  const plausible = observations.filter((o) => Date.parse(o.observedAt) <= now + 2 * MIN);
  const relevant = latestPerMeasure(plausible.map((o) => normalizeGrid(o, cfg))).filter((o) => appliesTo(o, areaId) && isActive(o, now, cfg));
  const mySensors = sensors.filter((x) => x.areaId === areaId);
  const evidence: EvidenceItem[] = [];
  const context: EvidenceItem[] = [];

  const typeOf = (o: Observation): EvidenceItem["evidenceType"] => {
    const kind = o.sourceKind ?? getSource(o.sourceId)?.kind;
    if (kind === "proxy" || o.kind === "connectivity") return "proxy";
    if (o.kind === "status_report" && !isOfficialClaim(o)) return "reported";
    if (kind === "estimate") return "estimated";
    return "official";
  };
  const item = (o: Observation, role: EvidenceItem["role"], summary = officialSummary(o)): EvidenceItem => ({
    sourceId: publicSourceId(o),
    sourceName: sourceName(o),
    tier: o.tier,
    evidenceType: typeOf(o),
    role,
    status: o.status,
    summary,
    count: 1,
    observedAt: o.observedAt,
    freshness: freshnessOf(ageMin(o.observedAt, now), o.kind === "status_report" ? STATUS_CONFIG : { freshness: cfg.officialFreshness }),
    url: o.url,
  });
  const sensorItem = (list: SensorState[], role: EvidenceItem["role"], summary: string): EvidenceItem => {
    const newest = list.reduce((a, b) => (Date.parse(a.observedAt) > Date.parse(b.observedAt) ? a : b));
    return {
      sourceId: "light_dey_sensor",
      sourceName: "Light Dey sensors",
      tier: 1,
      evidenceType: "measured",
      role,
      status: newest.mains === "on" || newest.mains === "off" ? newest.mains : null,
      summary,
      count: list.length,
      observedAt: newest.observedAt,
      freshness: freshnessOf(ageMin(newest.observedAt, now), { freshness: { freshMaxMinutes: 5, recentMaxMinutes: SENSOR_CONFIG.freshMinutes, ageingMaxMinutes: SENSOR_CONFIG.offlineMinutes } }),
      url: null,
    };
  };

  // ---- Context that never sets status ----
  for (const o of relevant) {
    if (o.kind === "disco_allocation" && o.status === null) {
      const d = DISCOS[o.scopeRef as keyof typeof DISCOS];
      context.push(item(o, "context", `${d?.name ?? o.scopeRef} is receiving ${Math.round(o.valueNum ?? 0)} MW from the national grid. That doesn't mean every feeder in ${area?.name ?? "this area"} has light (load shedding).`));
    } else if (o.kind === "notice") {
      context.push(item(o, "context", `Official notice: ${o.title ?? "see link"}`));
    } else if (o.kind === "connectivity") {
      context.push(item(o, "context", o.title ?? "Internet connectivity signal (weak proxy — generators and batteries keep networks up)"));
    }
  }
  const offline = mySensors.filter((x) => x.health === "offline");
  if (offline.length) {
    context.push(sensorItem(offline, "context", `${offline.length} sensor${offline.length > 1 ? "s" : ""} offline — silence isn't treated as an outage (it may be Wi-Fi or battery).`));
  }

  // ---- Classify sensor readings (one per network, newest first) ----
  const onePerNetwork = (list: SensorState[]) => {
    const seen = new Map<string, SensorState>();
    for (const x of [...list].sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))) if (!seen.has(x.networkHash)) seen.set(x.networkHash, x);
    return [...seen.values()];
  };
  const live = mySensors.filter((x) => x.health !== "offline" && (x.mains === "on" || x.mains === "off"));
  const strongSensors = onePerNetwork(live.filter((x) => x.health === "good" && x.supplyPoint === "grid_direct"));
  const weakSensors = onePerNetwork(
    live.filter(
      (x) =>
        !strongSensors.includes(x) &&
        // after a changeover, "mains on" could be the generator: only "off" says anything about the grid
        ((x.supplyPoint === "grid_direct" && x.health === "degraded") || (x.supplyPoint !== "grid_direct" && x.mains === "off")),
    ),
  ).filter((x) => !strongSensors.some((st) => st.networkHash === x.networkHash));
  const ambiguous = live.filter((x) => x.supplyPoint !== "grid_direct" && x.mains === "on");
  if (ambiguous.length) context.push(sensorItem(ambiguous, "context", `${ambiguous.length} sensor${ambiguous.length > 1 ? "s" : ""} after a generator changeover ${ambiguous.length > 1 ? "have" : "has"} power — could be generator, so not counted as grid evidence.`));

  // ---- Reports ----
  const verified = relevant.filter((x) => x.kind === "status_report" && x.status && !isOfficialClaim(x) && x.tier <= 2);
  const communityConfirmed: PowerStatus | null = community.state === "LIGHT" ? "on" : community.state === "NO_LIGHT" ? "off" : null;
  const communityItem = (role: EvidenceItem["role"]): EvidenceItem | null => {
    if (community.recentReports === 0) return null;
    return {
      sourceId: "community",
      sourceName: "Community reports",
      tier: 3,
      evidenceType: "reported",
      role,
      status: communityConfirmed ?? community.leaning,
      summary: `${community.onReporters} say light dey, ${community.offReporters} say no light (independent reporters, last hour)`,
      count: community.onReporters + community.offReporters,
      observedAt: community.lastReportAt,
      freshness: community.freshness,
      url: null,
    };
  };
  /** Reports only "support" what they actually said. */
  const communityRoleFor = (s: PowerStatus): EvidenceItem["role"] => {
    const said = communityConfirmed ?? community.leaning;
    return said === null ? "context" : said === s ? "supporting" : "conflicting";
  };
  const pushReports = (s: PowerStatus | null) => {
    for (const v of verified) evidence.push(item(v, s === null ? "context" : v.status === s ? "supporting" : "conflicting", `Verified report: ${word(v.status!)}`));
    const c = communityItem(s === null ? "context" : communityRoleFor(s));
    if (c) evidence.push(c);
  };
  const reportsAgainst = (s: PowerStatus) => verified.some((v) => v.status !== s) || (communityConfirmed !== null && communityConfirmed !== s);

  const finish = (mapState: MapState, confidence: Confidence, explanation: string, estimate: Estimate | null = null): AreaStatus => ({
    ...community,
    state: LEGACY_STATE[mapState],
    confidence,
    mapState,
    evidence: [...evidence, ...context],
    explanation,
    estimate,
    disco: discoOf(areaId)?.disco ?? null,
    sensors: { total: mySensors.length, online: mySensors.length - offline.length, offline: offline.length },
  });
  const lower = (c: Confidence): Confidence => (c === "high" ? "medium" : "low");

  // ---- 1. Strong: official claims + measured telemetry ----
  const official = relevant.filter(isOfficialClaim).sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt));
  const strongSides = new Set<PowerStatus>([...official.map((o) => o.status as PowerStatus), ...strongSensors.map((x) => x.mains as PowerStatus)]);
  if (strongSides.size === 2) {
    official.forEach((o) => evidence.push(item(o, "conflicting")));
    for (const side of ["on", "off"] as const) {
      const list = strongSensors.filter((x) => x.mains === side);
      if (list.length) evidence.push(sensorItem(list, "conflicting", `${list.length} sensor${list.length > 1 ? "s" : ""} measure ${side === "on" ? "grid power" : "no grid power"}`));
    }
    pushReports(null);
    return finish("CONFLICTING", "low", "Strong sources disagree right now (official data and/or sensors). Different streets may be on different feeders.");
  }
  if (strongSides.size === 1) {
    const s = [...strongSides][0];
    official.forEach((o, i) => evidence.push(item(o, i === 0 ? "decisive" : "supporting")));
    if (strongSensors.length) {
      evidence.push(sensorItem(strongSensors, official.length ? "supporting" : "decisive", `${strongSensors.length} healthy sensor${strongSensors.length > 1 ? "s on separate networks" : ""} ${SUPPLY_LABEL.grid_direct} measure${strongSensors.length > 1 ? "" : "s"} ${s === "on" ? "grid power" : "no grid power"}`));
    }
    for (const w of weakSensors) if (w.mains !== s) evidence.push(sensorItem([w], "conflicting", `A sensor (${w.health}) reads ${w.mains === "on" ? "power" : "no power"}`));
    pushReports(s);
    const independent = (official.length ? 1 : 0) + strongSensors.length;
    const oldOfficial = !strongSensors.length && official.length > 0 && ageMin(official[0].observedAt, now) > cfg.officialHighConfidenceMaxMinutes;
    let confidence: Confidence = independent >= 2 ? "high" : oldOfficial ? "medium" : official.length ? "high" : "medium";
    if (reportsAgainst(s)) confidence = lower(confidence);
    const why = strongSensors.length
      ? `Measured: ${strongSensors.length} sensor${strongSensors.length > 1 ? "s" : ""} detect${strongSensors.length > 1 ? "" : "s"} ${s === "on" ? "grid power" : "no grid power"}${official.length ? ", matching official grid data" : ""}.`
      : `Official data: ${word(s)}.${s === "off" && official[0].scope !== "neighbourhood" ? " Applies to grid supply; homes on generator, solar or inverter may still have power." : ""}`;
    const caveat = s === "off" ? " Neighbours reporting light may be on generator, solar or a separate feeder." : " Neighbours reporting no light may be on a different feeder.";
    return finish(s === "on" ? "CONFIRMED_ON" : "CONFIRMED_OFF", confidence, reportsAgainst(s) ? `${why} Some reports disagree.${caveat}` : why);
  }

  // ---- 2. Likely: indirect telemetry or corroborated verified reports ----
  const likelyVotes: { s: PowerStatus; why: string }[] = [];
  for (const w of weakSensors) likelyVotes.push({ s: w.mains as PowerStatus, why: w.supplyPoint === "grid_direct" ? `sensor ${w.health} (${w.healthReasons.join(", ") || "late"})` : `sensor ${SUPPLY_LABEL[w.supplyPoint]} reads no power` });
  const vOn = verified.filter((v) => v.status === "on");
  const vOff = verified.filter((v) => v.status === "off");
  for (const [side, list] of [["on", vOn], ["off", vOff]] as const) {
    if (list.length >= cfg.verifiedConfirmCount || (list.length >= 1 && communityConfirmed === side)) likelyVotes.push({ s: side, why: list.length >= cfg.verifiedConfirmCount ? `${list.length} verified reporters agree` : "a verified reporter and neighbours agree" });
  }
  const likelySides = new Set(likelyVotes.map((v) => v.s));
  if (likelySides.size === 2 || (likelySides.size === 1 && reportsAgainst([...likelySides][0]) && weakSensors.length > 0)) {
    if (weakSensors.length) evidence.push(sensorItem(weakSensors, "conflicting", `Indirect sensor readings: ${weakSensors.map((w) => w.mains).join(", ")}`));
    pushReports(null);
    return finish("CONFLICTING", "low", "Indirect sensor readings and reports disagree.");
  }
  if (likelySides.size === 1) {
    const s = [...likelySides][0];
    if (weakSensors.length) evidence.push(sensorItem(weakSensors, "decisive", `Indirect sensor evidence: ${likelyVotes.filter((v) => v.s === s && v.why.startsWith("sensor")).map((v) => v.why).join("; ")}`));
    pushReports(s);
    // Reports that drove the decision are "decisive" when no sensor did.
    if (!weakSensors.length) evidence.filter((e) => e.evidenceType === "reported" && e.role === "supporting").forEach((e) => (e.role = "decisive"));
    return finish(s === "on" ? "LIKELY_ON" : "LIKELY_OFF", reportsAgainst(s) ? "low" : "medium", `Likely ${word(s)}: ${likelyVotes.map((v) => v.why).join("; ")}. Not a direct measurement or official confirmation.`);
  }

  // ---- 3. Reported: community (3+ independent) or one fresh verified reporter ----
  if (vOn.length && vOff.length) {
    pushReports(null);
    return finish("CONFLICTING", "low", "Verified reporters disagree.");
  }
  if (community.state === "UNCERTAIN") {
    pushReports(null);
    return finish("CONFLICTING", "low", `Recent reports disagree and neither side has ${K()} independent confirmations.`);
  }
  const vSide: PowerStatus | null = vOn.length ? "on" : vOff.length ? "off" : null;
  if (vSide && communityConfirmed && communityConfirmed !== vSide) {
    pushReports(null);
    return finish("CONFLICTING", "low", "Verified reporters and neighbours disagree.");
  }
  if (communityConfirmed) {
    pushReports(communityConfirmed);
    evidence.filter((e) => e.sourceId === "community").forEach((e) => (e.role = "decisive"));
    return finish(communityConfirmed === "on" ? "COMMUNITY_ON" : "COMMUNITY_OFF", community.confidence, `${community.confirmingUsers} neighbours independently reported ${word(communityConfirmed)} in the last hour. Not officially confirmed or measured.`);
  }
  if (vSide) {
    pushReports(vSide);
    evidence.filter((e) => e.evidenceType === "reported" && e.sourceId !== "community" && e.status === vSide).forEach((e) => (e.role = "decisive"));
    return finish(vSide === "on" ? "COMMUNITY_ON" : "COMMUNITY_OFF", "low", `Reported by 1 verified reporter (${timeAgoMin(verified[0].observedAt, now)}). Not yet corroborated by a sensor, official data or a second report.`);
  }

  // ---- 4. Estimate from history — only when there are no fresh reports or sensor readings ----
  const est = community.recentReports === 0 && live.length === 0 ? estimateFrom(pattern, cfg, now) : null;
  const pending = communityItem(community.leaning ? "supporting" : "context");
  if (pending) evidence.push(pending);
  if (est) {
    evidence.push({
      sourceId: "historical_estimate",
      sourceName: "Estimate from history",
      tier: 4,
      evidenceType: "estimated",
      role: "estimate",
      status: est.status,
      summary: `${Math.round(est.probability * 100)}% of ${est.samples} past confirmed hours around this time had ${word(est.status)}`,
      count: est.samples,
      observedAt: null,
      freshness: "none",
      url: null,
    });
    return finish(est.status === "on" ? "ESTIMATED_ON" : "ESTIMATED_OFF", "low", "Prediction from past reports only — not live. Report what you see to make it live.", est);
  }

  // ---- 5. Not enough current evidence ----
  const why =
    community.recentReports > 0
      ? `Not enough current evidence: ${community.leaning ? `${community.leaning === "on" ? community.onReporters : community.offReporters} of ${K()} needed people say ${word(community.leaning)}` : "recent reports don't agree yet"}.`
      : mySensors.length && !live.length
        ? "Not enough current evidence: the sensors here are offline, and silence isn't an outage."
        : community.freshness === "stale"
          ? "Not enough current evidence: the last reports are over an hour old, so they no longer count as live."
          : "Not enough current evidence: no sensor, official outage data or recent report covers this area.";
  return finish("UNKNOWN", community.recentReports > 0 ? "low" : "none", why);
}

function timeAgoMin(iso: string, now: number): string {
  const m = Math.max(0, Math.round(ageMin(iso, now)));
  return m < 1 ? "just now" : `${m} min ago`;
}

/**
 * Latest NISO figures for the Lagos DisCos + national total, or null if stale/missing.
 * Uses exactly the same rules as the map (future readings dropped, newest per measure,
 * outage derived from MW), so the grid card can never disagree with area statuses.
 */
export function gridContextFrom(observations: Observation[], now: Date = new Date(), cfg: Cfg = EVIDENCE_CONFIG): import("./types").GridContext | null {
  const t = now.getTime();
  const grid = observations.filter((o) => o.sourceId === "niso_niggrid" && (o.kind === "disco_allocation" || o.kind === "grid_total") && Date.parse(o.observedAt) <= t + 2 * MIN);
  const fresh = latestPerMeasure(grid.map((o) => normalizeGrid(o, cfg))).filter((o) => isActive(o, t, cfg));
  if (!fresh.length) return null;
  const total = fresh.find((o) => o.kind === "grid_total");
  const discos = (Object.keys(DISCOS) as (keyof typeof DISCOS)[])
    .map((id) => ({ id, o: fresh.find((o) => o.kind === "disco_allocation" && o.scopeRef === id) }))
    .filter((d) => d.o)
    .map((d) => ({ id: d.id, name: DISCOS[d.id].name, mw: d.o!.valueNum ?? 0, asOf: d.o!.observedAt }));
  return {
    asOf: fresh.map((o) => o.observedAt).sort().at(-1)!,
    totalMw: total?.valueNum ?? null,
    totalAsOf: total?.observedAt ?? null,
    discos,
    sourceUrl: getSource("niso_niggrid")?.url ?? "https://www.niggrid.org/",
    collapse: total?.status === "off",
  };
}
