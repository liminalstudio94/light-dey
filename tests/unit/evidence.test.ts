import { describe, expect, it } from "vitest";
import { EVIDENCE_CONFIG } from "@/lib/config";
import { appliesTo, estimateFrom, gridContextFrom, isActive, resolveAreaStatus } from "@/lib/evidence";
import { aggregateAreaStatus } from "@/lib/status";
import type { Observation, PowerStatus, Report } from "@/lib/types";
import { NOW, rep } from "./helpers";

const T = NOW.getTime();
const iso = (minAgo: number) => new Date(T - minAgo * 60_000).toISOString();
let n = 0;
function obs(p: Partial<Observation> & Pick<Observation, "kind" | "scope">): Observation {
  const observedAt = p.observedAt ?? iso(5);
  return {
    id: `o${++n}`,
    sourceId: "niso_niggrid",
    externalId: `e${n}`,
    scopeRef: null,
    status: null,
    valueNum: null,
    title: null,
    url: "https://www.niggrid.org/DisCoLoadProfile",
    validUntil: new Date(Date.parse(observedAt) + EVIDENCE_CONFIG.officialMaxAgeMinutes * 60_000).toISOString(),
    neighbourhoodIds: [],
    tier: 1,
    ...p,
    observedAt,
  };
}
const collapse = (minAgo = 5) => obs({ kind: "grid_total", scope: "national", status: "off", valueNum: 40, observedAt: iso(minAgo) });
const disco = (id: "eko" | "ikeja", mw: number, minAgo = 5) =>
  obs({ kind: "disco_allocation", scope: "disco", scopeRef: id, valueNum: mw, status: mw <= EVIDENCE_CONFIG.discoOutageMaxMw ? "off" : null, observedAt: iso(minAgo) });
const verified = (sourceId: string, areaId: string, status: PowerStatus, minAgo = 5) =>
  obs({ sourceId, kind: "status_report", scope: "neighbourhood", scopeRef: areaId, status, tier: 2, observedAt: iso(minAgo) });

function resolve(areaId: string, reports: Report[], observations: Observation[] = [], pattern: { light: number; known: number } | null = null) {
  const community = aggregateAreaStatus(areaId, reports, NOW);
  return resolveAreaStatus({ community, observations, pattern: pattern && { areaId, hour: 13, lightHours: pattern.light, knownHours: pattern.known }, now: NOW });
}
const yaba = (status: PowerStatus, minAgo: number, who: string, net?: string) => rep(status, minAgo, who, { areaId: "yaba", net });

describe("evidence engine — basics", () => {
  it("no evidence => UNKNOWN with an explanation, never a guess", () => {
    const s = resolve("ikeja", []);
    expect(s.mapState).toBe("UNKNOWN");
    expect(s.explanation).toMatch(/Not enough verified data/);
    expect(s.evidence).toEqual([]);
  });

  it("3 independent community reports => COMMUNITY (not CONFIRMED)", () => {
    const s = resolve("surulere", ["a", "b", "c"].map((w, i) => rep("on", i + 1, w, { areaId: "surulere" })));
    expect(s.mapState).toBe("COMMUNITY_ON");
    expect(s.evidence?.[0]).toMatchObject({ sourceId: "community", role: "decisive", tier: 3, count: 3 });
  });

  it("conflicting community reports => CONFLICTING", () => {
    const s = resolve("surulere", [rep("on", 1, "a", { areaId: "surulere" }), rep("off", 2, "b", { areaId: "surulere" })]);
    expect(s.mapState).toBe("CONFLICTING");
  });

  it("repeat submissions by one person do not add confidence", () => {
    const s = resolve("surulere", [1, 3, 5, 7].map((m) => rep("off", m, "same-person", { areaId: "surulere" })));
    expect(s.mapState).toBe("UNKNOWN");
    expect(s.offReporters).toBe(1);
  });
});

describe("official sources", () => {
  it("fresh national grid collapse => CONFIRMED_OFF everywhere, with attribution", () => {
    const s = resolve("lekki-phase-1", [], [collapse()]);
    expect(s.mapState).toBe("CONFIRMED_OFF");
    expect(s.confidence).toBe("high");
    expect(s.evidence?.[0]).toMatchObject({ sourceId: "niso_niggrid", role: "decisive", tier: 1, sourceName: "NISO grid data" });
    expect(s.evidence?.[0].url).toContain("niggrid.org");
    expect(s.explanation).toMatch(/private or embedded generation/);
  });

  it("official outage expires: a 2-hour-old collapse is ignored", () => {
    expect(resolve("ikeja", [], [collapse(120)]).mapState).toBe("UNKNOWN");
  });

  it("an hour-old official reading still counts, since NISO publishes about hourly (Qodo #2-10)", () => {
    expect(resolve("ikeja", [], [collapse(60)]).mapState).toBe("CONFIRMED_OFF");
  });

  it("a 75-minute-old official reading still decides, but at medium confidence and labelled ageing (Qodo re-review #2-3)", () => {
    const s = resolve("ikeja", [], [collapse(75)]);
    expect(s.mapState).toBe("CONFIRMED_OFF");
    expect(s.confidence).toBe("medium");
    expect(s.evidence?.[0].freshness).toBe("ageing");
    expect(resolve("ikeja", [], [collapse(20)]).evidence?.[0].freshness).toBe("fresh");
  });

  it("a newer positive reading supersedes an older outage immediately (Qodo #2-3, #3-1)", () => {
    expect(resolve("ajah", [], [disco("eko", 0, 30)]).mapState).toBe("CONFIRMED_OFF");
    const s = resolve("ajah", [], [disco("eko", 0, 30), disco("eko", 410, 5)]);
    expect(s.mapState).toBe("UNKNOWN");
    expect(s.evidence?.map((e) => e.role)).toEqual(["context"]);
    expect(resolve("yaba", [], [collapse(40), obs({ kind: "grid_total", scope: "national", valueNum: 3100, observedAt: iso(3) })]).mapState).toBe("UNKNOWN");
  });

  it("an older positive reading does not hide a newer outage", () => {
    expect(resolve("ajah", [], [disco("eko", 410, 30), disco("eko", 0, 5)]).mapState).toBe("CONFIRMED_OFF");
  });

  it("a future-dated reading cannot supersede a real one", () => {
    expect(resolve("ajah", [], [disco("eko", 0, 5), disco("eko", 400, -60)]).mapState).toBe("CONFIRMED_OFF");
  });

  it("grid status is derived from the MW value, never trusted from a stored flag (Qodo #2-8)", () => {
    const lies = [
      obs({ kind: "disco_allocation", scope: "disco", scopeRef: "eko", valueNum: 480, status: "off" }),
      obs({ kind: "grid_total", scope: "national", valueNum: 3200, status: "on" }),
    ];
    const s = resolve("ajah", [], lies);
    expect(s.mapState).toBe("UNKNOWN");
    expect(s.evidence?.every((e) => e.role === "context" && e.status === null)).toBe(true);
    const unflagged = obs({ kind: "disco_allocation", scope: "disco", scopeRef: "eko", valueNum: 0, status: null });
    expect(resolve("ajah", [], [unflagged]).mapState).toBe("CONFIRMED_OFF");
    expect(resolve("yaba", [], [obs({ kind: "grid_total", scope: "national", valueNum: 3200, status: "on" })]).mapState).not.toBe("CONFIRMED_ON");
  });

  it("observations past valid_until or from the future are ignored", () => {
    const expired = { ...collapse(5), validUntil: iso(1) };
    const future = collapse(-30);
    expect(isActive(expired, T)).toBe(false);
    expect(isActive(future, T)).toBe(false);
    expect(resolve("ikeja", [], [expired, future]).mapState).toBe("UNKNOWN");
  });

  it("DisCo at 0 MW => CONFIRMED_OFF only for areas officially mapped to that DisCo", () => {
    const o = [disco("eko", 0)];
    expect(resolve("lekki-phase-1", [], o).mapState).toBe("CONFIRMED_OFF");
    expect(resolve("ikeja", [], o).mapState).toBe("UNKNOWN"); // Ikeja Electric area
    expect(resolve("victoria-island", [], o).mapState).toBe("UNKNOWN"); // not mapped
  });

  it("positive DisCo allocation is context only, never 'light dey'", () => {
    const s = resolve("ikeja", [], [disco("ikeja", 493)]);
    expect(s.mapState).toBe("UNKNOWN");
    expect(s.evidence).toHaveLength(1);
    expect(s.evidence?.[0]).toMatchObject({ role: "context", status: null });
    expect(s.evidence?.[0].summary).toMatch(/doesn't mean every feeder/);
  });

  it("official outage beats contradicting community reports but lowers confidence and says why", () => {
    const s = resolve("ikeja", ["a", "b", "c"].map((w, i) => rep("on", i + 1, w, { areaId: "ikeja" })), [disco("ikeja", 0)]);
    expect(s.mapState).toBe("CONFIRMED_OFF");
    expect(s.confidence).toBe("medium");
    expect(s.evidence?.find((e) => e.sourceId === "community")?.role).toBe("conflicting");
    expect(s.explanation).toMatch(/generator\/solar/);
  });

  it("opposing official evidence => CONFLICTING", () => {
    const partnerOn = obs({ sourceId: "partner:estate", kind: "status_report", scope: "neighbourhood", scopeRef: "ikeja", status: "on", tier: 1 });
    expect(resolve("ikeja", [], [disco("ikeja", 0), partnerOn]).mapState).toBe("CONFLICTING");
  });

  it("notices are linked as context and never set status", () => {
    const notice = obs({ sourceId: "ikeja_electric_notices", kind: "notice", scope: "disco", scopeRef: "ikeja", title: "Planned maintenance", neighbourhoodIds: ["shomolu"], observedAt: iso(60 * 24), validUntil: iso(-60 * 24 * 13) });
    expect(appliesTo(notice, "shomolu")).toBe(true);
    // Qodo #2-5: another area under the same DisCo, or a national notice, must not inherit it.
    expect(appliesTo(notice, "ikeja")).toBe(false);
    expect(appliesTo({ ...notice, scope: "national", scopeRef: null }, "yaba")).toBe(false);
    const s = resolve("shomolu", [], [notice]);
    expect(s.mapState).toBe("UNKNOWN");
    expect(s.evidence?.[0]).toMatchObject({ role: "context", sourceId: "ikeja_electric_notices" });
  });
});

describe("verified reporters (tier 2)", () => {
  it("one verified reporter alone is not shown as an established status (Qodo #2-6)", () => {
    const s = resolve("ikoyi", [], [verified("verified:ada", "ikoyi", "on")]);
    expect(s.mapState).toBe("UNKNOWN");
    expect(s.state).toBe("UNKNOWN");
    expect(s.explanation).toMatch(/1 verified reporter says light dey/);
    expect(s.evidence?.[0]).toMatchObject({ role: "supporting", sourceName: "Verified reporter" });
  });
  it("two independent verified reporters confirm", () => {
    expect(resolve("ikoyi", [], [verified("vr:1", "ikoyi", "off"), verified("vr:2", "ikoyi", "off")]).mapState).toBe("CONFIRMED_OFF");
  });
  it("the same verified reporter twice counts once", () => {
    expect(resolve("ikoyi", [], [verified("vr:1", "ikoyi", "off", 2), verified("vr:1", "ikoyi", "off", 8)]).mapState).toBe("UNKNOWN");
  });
  it("two verified reporters with their own sources (the issued key model) confirm (Qodo #2-2)", () => {
    // scripts/partner-key.mjs issues one `verified:<slug>` source per vetted person.
    expect(resolve("ikoyi", [], [verified("verified:ada-ikoyi", "ikoyi", "off"), verified("verified:tunde-ikoyi", "ikoyi", "off")]).mapState).toBe("CONFIRMED_OFF");
  });
  it("one verified + community confirmation of the same status confirms", () => {
    const s = resolve("ikoyi", ["a", "b", "c"].map((w, i) => rep("on", i + 1, w, { areaId: "ikoyi" })), [verified("vr:1", "ikoyi", "on")]);
    expect(s.mapState).toBe("CONFIRMED_ON");
  });
  it("verified vs community disagreement => CONFLICTING", () => {
    const s = resolve("ikoyi", ["a", "b", "c"].map((w, i) => rep("on", i + 1, w, { areaId: "ikoyi" })), [verified("vr:1", "ikoyi", "off")]);
    expect(s.mapState).toBe("CONFLICTING");
  });
  it("stale verified reports expire", () => {
    expect(resolve("ikoyi", [], [verified("vr:1", "ikoyi", "off", 90), verified("vr:2", "ikoyi", "off", 90)]).mapState).toBe("UNKNOWN");
  });
});

describe("public source names", () => {
  it("never expose partner or verified-reporter source ids (Qodo #4-9)", () => {
    const s = resolve("ikoyi", [], [verified("verified:ada-ikoyi", "ikoyi", "off"), verified("verified:tunde-ikoyi", "ikoyi", "off")]);
    expect(JSON.stringify(s.evidence)).not.toMatch(/ada-ikoyi|tunde-ikoyi/);
    const partner = obs({ sourceId: "partner:acme-estate", kind: "status_report", scope: "neighbourhood", scopeRef: "ikoyi", status: "off", tier: 1 });
    expect(resolve("ikoyi", [], [partner]).evidence?.[0].sourceName).toBe("Approved partner");
  });
});

describe("estimates", () => {
  it("strong history => ESTIMATED_*, labelled, low confidence", () => {
    const s = resolve("agege", [], [], { light: 8, known: 10 });
    expect(s.mapState).toBe("ESTIMATED_ON");
    expect(s.confidence).toBe("low");
    expect(s.state).toBe("UNKNOWN"); // never coloured as live
    expect(s.evidence?.[0]).toMatchObject({ role: "estimate", tier: 4 });
    expect(s.explanation).toMatch(/not live/);
  });
  it("thin or mixed history => no estimate", () => {
    expect(estimateFrom({ areaId: "x", hour: 1, lightHours: 5, knownHours: 5 })).toBeNull(); // < 6 samples
    expect(estimateFrom({ areaId: "x", hour: 1, lightHours: 6, knownHours: 10 })).toBeNull(); // 60%
  });
  it("fresh reports, even below the threshold, suppress the estimate (Qodo #2-9)", () => {
    const s = resolve("agege", [rep("off", 2, "a", { areaId: "agege" }), rep("off", 4, "b", { areaId: "agege" })], [], { light: 10, known: 10 });
    expect(s.mapState).toBe("UNKNOWN");
    expect(s.explanation).toMatch(/2 of 3 needed people say no light/);
    expect(s.evidence?.some((e) => e.role === "estimate")).toBe(false);
  });
  it("live community evidence always beats an estimate", () => {
    const s = resolve("agege", ["a", "b", "c"].map((w, i) => rep("off", i + 1, w, { areaId: "agege" })), [], { light: 10, known: 10 });
    expect(s.mapState).toBe("COMMUNITY_OFF");
  });
});

describe("Yaba scenario — no hard-coding, evidence decides", () => {
  it("no evidence => UNKNOWN (not 'no light')", () => {
    const s = resolve("yaba", []);
    expect(s.mapState).toBe("UNKNOWN");
    expect(s.disco).toBeNull(); // Yaba is not officially mapped to a DisCo
  });
  it("a single unverified outage report => still UNKNOWN, explains 1 of 3", () => {
    const s = resolve("yaba", [yaba("off", 3, "a")]);
    expect(s.mapState).toBe("UNKNOWN");
    expect(s.explanation).toMatch(/1 of 3 needed people say no light/);
  });
  it("one person reporting repeatedly cannot create an outage", () => {
    expect(resolve("yaba", [yaba("off", 1, "a"), yaba("off", 12, "a"), yaba("off", 25, "a")]).mapState).toBe("UNKNOWN");
  });
  it("three people on one network cannot create an outage", () => {
    expect(resolve("yaba", [yaba("off", 1, "a", "wifi"), yaba("off", 2, "b", "wifi"), yaba("off", 3, "c", "wifi")]).mapState).toBe("UNKNOWN");
  });
  it("three fresh independent outage reports => COMMUNITY_OFF with counts and timestamps", () => {
    const s = resolve("yaba", [yaba("off", 2, "a"), yaba("off", 6, "b"), yaba("off", 11, "c")]);
    expect(s.mapState).toBe("COMMUNITY_OFF");
    expect(s.evidence?.[0]).toMatchObject({ sourceId: "community", count: 3, freshness: "fresh" });
    expect(s.evidence?.[0].observedAt).toBe(iso(2));
  });
  it("the same reports an hour later have expired => UNKNOWN (stale)", () => {
    const s = resolve("yaba", [yaba("off", 62, "a"), yaba("off", 66, "b"), yaba("off", 71, "c")]);
    expect(s.mapState).toBe("UNKNOWN");
    expect(s.explanation).toMatch(/over an hour old/);
  });
  it("an Eko or Ikeja DisCo outage does not reach unmapped Yaba", () => {
    expect(resolve("yaba", [], [disco("eko", 0), disco("ikeja", 0)]).mapState).toBe("UNKNOWN");
  });
  it("a fresh national grid collapse => CONFIRMED_OFF with NISO attribution", () => {
    const s = resolve("yaba", [], [collapse(4)]);
    expect(s.mapState).toBe("CONFIRMED_OFF");
    expect(s.evidence?.[0]).toMatchObject({ sourceId: "niso_niggrid", role: "decisive" });
  });
  it("two verified Yaba reporters => CONFIRMED_OFF", () => {
    expect(resolve("yaba", [], [verified("vr:a", "yaba", "off"), verified("vr:b", "yaba", "off")]).mapState).toBe("CONFIRMED_OFF");
  });
});

describe("gridContextFrom — same rules as the map (Qodo re-review #2-2, #4-4)", () => {
  it("collapse comes from the MW value, not a stored flag, and matches the map", () => {
    const flaggedNormal = obs({ kind: "grid_total", scope: "national", valueNum: 3100, status: "off" });
    const unflaggedLow = obs({ kind: "grid_total", scope: "national", valueNum: 40, status: null });
    expect(gridContextFrom([flaggedNormal], NOW)?.collapse).toBe(false);
    expect(resolve("yaba", [], [flaggedNormal]).mapState).toBe("UNKNOWN");
    expect(gridContextFrom([unflaggedLow], NOW)?.collapse).toBe(true);
    expect(resolve("yaba", [], [unflaggedLow]).mapState).toBe("CONFIRMED_OFF");
  });
  it("uses the newest reading and ignores future-dated ones", () => {
    const g = gridContextFrom([collapse(30), obs({ kind: "grid_total", scope: "national", valueNum: 3000, observedAt: iso(5) }), obs({ kind: "grid_total", scope: "national", valueNum: 10, observedAt: iso(-60) })], NOW);
    expect(g?.totalMw).toBe(3000);
    expect(g?.collapse).toBe(false);
  });
  it("carries each figure's own time (Qodo re-review #4-3)", () => {
    const g = gridContextFrom([disco("eko", 482, 50), disco("ikeja", 493, 5), obs({ kind: "grid_total", scope: "national", valueNum: 3216, observedAt: iso(5) })], NOW);
    expect(g?.discos.find((d) => d.id === "eko")?.asOf).toBe(iso(50));
    expect(g?.totalAsOf).toBe(iso(5));
    expect(g?.asOf).toBe(iso(5));
  });
});

describe("gridContextFrom", () => {
  it("returns Lagos DisCo figures when fresh, null when stale", () => {
    const g = gridContextFrom([disco("eko", 482), disco("ikeja", 493), obs({ kind: "grid_total", scope: "national", valueNum: 3216 })], NOW);
    expect(g?.discos.map((d) => d.mw)).toEqual([482, 493]);
    expect(g?.totalMw).toBe(3216);
    expect(g?.collapse).toBe(false);
    expect(gridContextFrom([disco("eko", 482, 120)], NOW)).toBeNull();
  });
});
