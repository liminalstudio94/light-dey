import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { GET as cron } from "@/app/api/cron/refresh/route";
import { POST as ingest } from "@/app/api/ingest/observations/route";
import { fetchWithRetry, type Fetcher } from "@/lib/ingest/http";
import { areasMentioned, noticeObservations, parseRss } from "@/lib/ingest/ikejaNotices";
import { niggridObservations, parseDiscoLoadProfile, parseLagosDateTime } from "@/lib/ingest/niggrid";
import { ADAPTERS, runAdapter, snapshotChanges } from "@/lib/ingest/runner";
import { refreshDueSources } from "@/lib/server/refresh";
import { hashKey } from "@/lib/partner";
import { MemoryStore } from "@/lib/store/memory";
import { EVIDENCE_CONFIG } from "@/lib/config";

const NIGGRID = readFileSync("tests/fixtures/niggrid-disco-load-profile.html", "utf8");
const FEED = readFileSync("tests/fixtures/ikeja-electric-feed.xml", "utf8");
const AT = new Date("2026-11-13T19:20:00Z"); // 20:20 Lagos, 13 min after the fixture's "as at"
const niso = ADAPTERS.find((a) => a.sourceId === "niso_niggrid")!;
const ie = ADAPTERS.find((a) => a.sourceId === "ikeja_electric_notices")!;
const ok = (text: string): Fetcher => async () => ({ status: 200, text });

describe("NIGGRID parser (real page fixture)", () => {
  it("reads the timestamp in Lagos time and every DisCo row", () => {
    expect(parseLagosDateTime("13/11/2026 20:07:00")).toBe("2026-11-13T19:07:00.000Z");
    // Qodo re-review #3-5: impossible dates/times are rejected, not rolled over.
    for (const bad of ["31/02/2026 10:00:00", "00/11/2026 10:00:00", "13/13/2026 10:00:00", "13/11/2026 24:00:00", "13/11/2026 20:60:00", "13/11/2026 20:07:61"]) expect(parseLagosDateTime(bad), bad).toBeNull();
    expect(() => parseDiscoLoadProfile(NIGGRID.replace("13/11/2026", "31/02/2026"), AT)).toThrow(/unparseable/);
    const p = parseDiscoLoadProfile(NIGGRID, AT);
    expect(p.asOf).toBe("2026-11-13T19:07:00.000Z");
    expect(p.rows.find((r) => r.name === "Eko Disco")?.mw).toBe(482);
    expect(p.rows.find((r) => r.name === "Ikeja Disco")?.mw).toBe(493);
    expect(p.totalMw).toBe(3216);
    expect(p.rows.some((r) => /total/i.test(r.name))).toBe(false);
  });
  it("positive allocations become context only; 0 MW becomes an outage; collapse detected", () => {
    const p = parseDiscoLoadProfile(NIGGRID, AT);
    const obs = niggridObservations(p);
    expect(obs.map((o) => [o.externalId.split(":")[0] + ":" + (o.scopeRef ?? ""), o.status])).toEqual([["total:", null], ["disco:eko", null], ["disco:ikeja", null]]);
    const dark = niggridObservations({ ...p, rows: p.rows.map((r) => ({ ...r, mw: r.name === "Eko Disco" ? 0 : r.mw })) });
    expect(dark.find((o) => o.scopeRef === "eko")?.status).toBe("off");
    const collapse = niggridObservations({ ...p, totalMw: 120 });
    expect(collapse[0]).toMatchObject({ kind: "grid_total", status: "off", scope: "national" });
    expect(Date.parse(obs[0].validUntil) - Date.parse(obs[0].observedAt)).toBe(EVIDENCE_CONFIG.officialMaxAgeMinutes * 60_000);
  });
  it("fails loudly (no data) when the layout changes", () => {
    expect(() => parseDiscoLoadProfile("<html>maintenance</html>", AT)).toThrow(/timestamp not found/);
    expect(() => parseDiscoLoadProfile(NIGGRID.replace("Eko Disco", "EKO"), AT)).toThrow(/'Eko Disco' row missing/);
    expect(() => parseDiscoLoadProfile(NIGGRID.replace("482.00", "n/a"), AT)).toThrow(/bad row/);
    expect(() => parseDiscoLoadProfile(NIGGRID, new Date("2026-11-13T10:00:00Z"))).toThrow(/future/);
    expect(() => parseDiscoLoadProfile(NIGGRID.replace("482.00", "999.00"), AT)).toThrow(/page total/);
    // Qodo #3-3: the Total row is the integrity check — missing, duplicated or truncated tables fail.
    const noTotal = NIGGRID.replace(/<tr[^>]*>\s*<td>Total:[\s\S]*?<\/tr>/, "");
    expect(noTotal).not.toMatch(/Total:/);
    expect(() => parseDiscoLoadProfile(noTotal, AT)).toThrow(/Total row missing/);
    const twoTotals = NIGGRID.replace(/(<tr[^>]*>\s*<td>Total:[\s\S]*?<\/tr>)/, "$1$1");
    expect(() => parseDiscoLoadProfile(twoTotals, AT)).toThrow(/more than one Total/);
    const truncated = NIGGRID.replace(/<tr[^>]*>\s*<td>Abuja Disco[\s\S]*?<\/tr>/, "");
    expect(() => parseDiscoLoadProfile(truncated, AT)).toThrow(/page total/);
  });
});

describe("Ikeja Electric notices (real feed fixture)", () => {
  it("parses items and matches supported areas by name only", () => {
    const items = parseRss(FEED);
    expect(items).toHaveLength(5);
    const shomolu = items.find((i) => /Shomolu/.test(i.title + i.text))!;
    // Qodo re-review #3-3: the publisher's name isn't a mention of the Ikeja neighbourhood.
    expect(areasMentioned(shomolu.title + " " + shomolu.text)).toEqual(["shomolu"]);
    expect(areasMentioned("Ikeja Electric Plc announces works")).toEqual([]);
    expect(areasMentioned("Ikeja Electric announces works in Ikeja GRA and Ikeja")).toEqual(["ikeja", "ikeja-gra"]);
    expect(areasMentioned("Victoria Garden City")).toEqual([]); // no 'vi' alias false positive
    expect(areasMentioned("Outage in Lekki this weekend")).toEqual([]); // Qodo #3-6: 'lekki' is shared by two areas
    expect(areasMentioned("Outage in Lekki Phase 1")).toEqual(["lekki-phase-1"]);
    expect(areasMentioned("Yaba and Surulere")).toEqual(["yaba", "surulere"]);
  });
  it("keeps only recent notices that name an area, as context (no status)", () => {
    const obs = noticeObservations(parseRss(FEED), new Date("2026-10-20T12:00:00Z"));
    expect(obs.length).toBeGreaterThan(0);
    for (const o of obs) {
      expect(o.status).toBeNull();
      expect(o.kind).toBe("notice");
      expect(o.neighbourhoodIds.length).toBeGreaterThan(0);
      expect(o.url).toMatch(/^https:\/\/www\.ikejaelectric\.com\//);
    }
    expect(noticeObservations(parseRss(FEED), new Date("2027-01-01T00:00:00Z"))).toEqual([]); // expired
  });
  it("rejects non-RSS and truncated responses, accepts a valid empty feed (Qodo #3-5)", () => {
    expect(() => parseRss("<html>blocked</html>")).toThrow(/not RSS/);
    expect(() => parseRss(FEED.slice(0, Math.floor(FEED.length / 2)))).toThrow(/truncated|<item>/);
    expect(() => parseRss(FEED.slice(0, FEED.indexOf("</item>")) + "</channel></rss>")).toThrow(/<item>/);
    expect(parseRss('<?xml version="1.0"?><rss version="2.0"><channel><title>x</title></channel></rss>')).toEqual([]);
  });
});

describe("runner: retries, leases, failures, idempotency", () => {
  let store: MemoryStore;
  beforeEach(() => (store = new MemoryStore()));

  it("retries 5xx then succeeds; gives up after 3 attempts; does not retry 404", async () => {
    let calls = 0;
    const flaky: Fetcher = async () => (++calls < 3 ? { status: 503, text: "" } : { status: 200, text: "ok" });
    expect((await fetchWithRetry(flaky, "u", [], { baseDelayMs: 1 })).attempts).toBe(3);
    calls = 0;
    await expect(fetchWithRetry(async () => ({ status: 500, text: "" }), "u", [], { baseDelayMs: 1 })).rejects.toThrow(/HTTP 500/);
    let n404 = 0;
    await expect(fetchWithRetry(async () => (n404++, { status: 404, text: "" }), "u", [], { baseDelayMs: 1 })).rejects.toThrow();
    expect(n404).toBe(1);
  });

  it("stops retrying at the deadline so slow sources can't overrun the function (Qodo #3-11)", async () => {
    let calls = 0;
    const slow: Fetcher = async () => (calls++, { status: 503, text: "" });
    await expect(fetchWithRetry(slow, "u", [], { baseDelayMs: 50, deadline: Date.now() + 20 })).rejects.toThrow();
    expect(calls).toBe(1);
    await expect(fetchWithRetry(slow, "u", [], { deadline: Date.now() - 1 })).rejects.toThrow(/deadline/);
  });

  it("writes observations, records the run, and is idempotent on re-run", async () => {
    const r1 = await runAdapter(store, niso, { now: AT, fetcher: ok(NIGGRID) });
    expect(r1).toMatchObject({ status: "ok", itemsWritten: 3 });
    const r2 = await runAdapter(store, niso, { now: AT, fetcher: ok(NIGGRID), force: true });
    expect(r2).toMatchObject({ status: "ok", itemsWritten: 0 });
    expect(store.observations).toHaveLength(3);
    expect(store.runs.map((r) => r.result.status)).toEqual(["ok", "ok"]);
  });

  it("respects the lease (rate limit toward the source)", async () => {
    await runAdapter(store, niso, { now: AT, fetcher: ok(NIGGRID) });
    const again = await runAdapter(store, niso, { now: new Date(AT.getTime() + 5 * 60_000), fetcher: ok(NIGGRID) });
    expect(again.status).toBe("skipped");
    const later = await runAdapter(store, niso, { now: new Date(AT.getTime() + 11 * 60_000), fetcher: ok(NIGGRID) });
    expect(later.status).not.toBe("skipped");
  });

  it("a failing source records an error and writes nothing (old data expires on its own)", async () => {
    const r = await runAdapter(store, ie, { now: AT, fetcher: ok("<html>Access denied</html>") });
    expect(r.status).toBe("error");
    expect(store.observations).toHaveLength(0);
    expect(store.runs[0].result.error).toMatch(/not RSS/);
  });

  it("forced runs never fetch the same source concurrently, and the lock is released after (Qodo #3-9)", async () => {
    let fetches = 0;
    const counting: Fetcher = async () => (fetches++, { status: 200, text: NIGGRID });
    const [a, b] = await Promise.all([runAdapter(store, niso, { now: AT, fetcher: counting, force: true }), runAdapter(store, niso, { now: AT, fetcher: counting, force: true })]);
    expect([a.status, b.status].sort()).toEqual(["ok", "skipped"]);
    expect(fetches).toBe(1);
    expect((await runAdapter(store, niso, { now: AT, fetcher: counting, force: true })).status).toBe("ok");
  });

  it("a recovery reading clears the outage right away (Qodo #3-1)", async () => {
    const { aggregateAreaStatus } = await import("@/lib/status");
    const { resolveAreaStatus } = await import("@/lib/evidence");
    const ajah = async (now: Date) => resolveAreaStatus({ community: aggregateAreaStatus("ajah", [], now), observations: await store.listObservations(now), now }).mapState;
    const dark = NIGGRID.replace("<td>Eko Disco</td><td>482.00</td>", "<td>Eko Disco</td><td>0.00</td>").replace("3,216.00", "2,734.00");
    await runAdapter(store, niso, { now: AT, fetcher: ok(dark), force: true });
    expect(await ajah(AT)).toBe("CONFIRMED_OFF");
    const later = new Date(AT.getTime() + 15 * 60_000);
    const back = NIGGRID.replace("20:07:00", "20:30:00");
    await runAdapter(store, niso, { now: later, fetcher: ok(back), force: true });
    expect(await ajah(later)).toBe("UNKNOWN");
  });

  it("concurrent snapshot writes don't duplicate (Qodo #3-8)", async () => {
    const s = (areaId: string) => ({ areaId, mapState: "UNKNOWN", confidence: "none", freshness: "none" }) as never;
    const [x, y] = await Promise.all([snapshotChanges(store, [s("yaba")]), snapshotChanges(store, [s("yaba")])]);
    expect(x + y).toBe(1);
  });

  it("can be disabled with its kill switch", async () => {
    process.env.SOURCE_NISO_ENABLED = "0";
    try {
      expect((await runAdapter(store, niso, { now: AT, fetcher: ok(NIGGRID) })).status).toBe("skipped");
    } finally {
      delete process.env.SOURCE_NISO_ENABLED;
    }
  });

  it("snapshots only areas whose map state changed", async () => {
    const s = (areaId: string, mapState: "UNKNOWN" | "COMMUNITY_OFF") => ({ areaId, mapState, confidence: "low", freshness: "fresh" }) as never;
    expect(await snapshotChanges(store, [s("yaba", "UNKNOWN"), s("ikeja", "UNKNOWN")])).toBe(2);
    expect(await snapshotChanges(store, [s("yaba", "UNKNOWN"), s("ikeja", "COMMUNITY_OFF")])).toBe(1);
  });
});

describe("partner ingestion API", () => {
  const g = globalThis as unknown as { __lightDeyStore?: MemoryStore };
  const KEY = "ldp_test_key_0123456789abcdefghijkl";
  const KEY2 = "ldp_other_key_0123456789abcdefghijk";
  let store: MemoryStore;
  beforeEach(() => {
    store = new MemoryStore();
    store.partnerKeys.set(hashKey(KEY), { keyId: "k1", sourceId: "verified:ada", tier: 2, allowedAreas: ["yaba"] });
    store.partnerKeys.set(hashKey(KEY2), { keyId: "k2", sourceId: "verified:ada", tier: 2, allowedAreas: ["yaba"] });
    g.__lightDeyStore = store;
  });
  const call = (body: unknown, key: string | null = KEY) =>
    ingest(new NextRequest("http://localhost/api/ingest/observations", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) } }));
  const body = (o: Record<string, unknown> = {}) => ({ neighbourhoodId: "yaba", status: "off", observedAt: new Date(Date.now() - 60_000).toISOString(), externalId: "ada-1", ...o });

  it("rejects missing or unknown keys", async () => {
    expect((await call(body(), null)).status).toBe(401);
    expect((await call(body(), "ldp_wrong_key_0123456789abcdefghij")).status).toBe(401);
  });
  it("validates area, status, time and id", async () => {
    expect((await call(body({ neighbourhoodId: "atlantis" }))).status).toBe(400);
    expect((await call(body({ status: "maybe" }))).status).toBe(400);
    expect((await call(body({ observedAt: new Date(Date.now() + 3_600_000).toISOString() }))).status).toBe(400);
    expect((await call(body({ observedAt: new Date(Date.now() - 2 * 3_600_000).toISOString() }))).status).toBe(400);
    expect((await call(body({ externalId: "bad id!" }))).status).toBe(400);
  });
  it("rejects areas outside the key's approved coverage (Qodo #3-10)", async () => {
    const r = await call(body({ neighbourhoodId: "ikeja" }));
    expect(r.status).toBe(403);
    expect(store.observations).toHaveLength(0);
  });
  it("an externalId stays bound to its first area (Qodo #3-2)", async () => {
    store.partnerKeys.get(hashKey(KEY))!.allowedAreas.push("surulere");
    expect((await call(body({ externalId: "dup" }))).status).toBe(201);
    expect((await call(body({ externalId: "dup", neighbourhoodId: "surulere" }))).status).toBe(409);
    expect(store.observations[0].scopeRef).toBe("yaba");
  });
  it("hourly quota is per key and counts updates to the same externalId (Qodo #3-4)", async () => {
    for (let i = 0; i < 120; i++) expect(await store.consumePartnerQuota("k1", 120, new Date())).toBe(true);
    expect((await call(body({ status: "on" }))).status).toBe(429);
    expect((await call(body({ externalId: "other" }), KEY2)).status).toBe(201); // separate key, separate allowance
  });
  it("stores a tier-2 observation once (idempotent) and logs a verification event", async () => {
    const b = body();
    expect((await call(b)).status).toBe(201);
    expect((await call(b)).status).toBe(200);
    expect(store.observations).toHaveLength(1);
    expect(store.observations[0]).toMatchObject({ sourceId: "verified:ada", tier: 2, scopeRef: "yaba", status: "off" });
    expect(store.events).toHaveLength(1);
  });
});

describe("refresh orchestration", () => {
  it("the opportunistic path skips overview + snapshots when nothing ran (Qodo #3-12)", async () => {
    const g = globalThis as unknown as { __lightDeyStore?: MemoryStore };
    const store = new MemoryStore();
    g.__lightDeyStore = store;
    process.env.SOURCE_NISO_ENABLED = "0";
    process.env.SOURCE_IKEJA_NOTICES_ENABLED = "0";
    try {
      await refreshDueSources({ snapshot: "if-changed" }); // takes the hourly patterns lease
      const second = await refreshDueSources({ snapshot: "if-changed" });
      expect(second.snapshots).toBe(0);
      expect(second.mapCounts).toBeNull();
      expect(store.snapshots).toHaveLength(41); // only the first call wrote
      const errors = (await refreshDueSources({ snapshot: "always" })).errors;
      expect(errors).toBe(0);
    } finally {
      delete process.env.SOURCE_NISO_ENABLED;
      delete process.env.SOURCE_IKEJA_NOTICES_ENABLED;
    }
  });
});

describe("Qodo re-review on PR #3", () => {
  const g = globalThis as unknown as { __lightDeyStore?: MemoryStore };

  it("a kill switch removes that source's stored evidence from reads immediately (#1)", async () => {
    const store = new MemoryStore();
    g.__lightDeyStore = store;
    const { getOverview } = await import("@/lib/server/data");
    const now = Date.now();
    await store.upsertObservations([{ sourceId: "niso_niggrid", externalId: "d", scope: "disco", scopeRef: "eko", kind: "disco_allocation", status: "off", valueNum: 0, title: null, url: null, observedAt: new Date(now - 60_000).toISOString(), validUntil: new Date(now + 3_600_000).toISOString(), neighbourhoodIds: [] }]);
    const ajah = async () => (await getOverview(new Date())).statuses.find((s) => s.areaId === "ajah")!.mapState;
    expect(await ajah()).toBe("CONFIRMED_OFF");
    process.env.SOURCE_NISO_ENABLED = "0";
    try {
      expect(await ajah()).toBe("UNKNOWN");
    } finally {
      delete process.env.SOURCE_NISO_ENABLED;
    }
  });

  it("concurrent submissions with one externalId can't move a claim to another area (#2)", async () => {
    const store = new MemoryStore();
    const KEY = "ldp_concurrent_key_0123456789abcdef";
    store.partnerKeys.set(hashKey(KEY), { keyId: "kc", sourceId: "partner:estate", tier: 1, allowedAreas: ["yaba", "surulere"] });
    g.__lightDeyStore = store;
    const req = (area: string) =>
      ingest(new NextRequest("http://localhost/api/ingest/observations", { method: "POST", body: JSON.stringify({ neighbourhoodId: area, status: "off", observedAt: new Date(Date.now() - 60_000).toISOString(), externalId: "same" }), headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` } }));
    const [a, b] = await Promise.all([req("yaba"), req("surulere")]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(store.observations).toHaveLength(1);
    const first = a.status === 201 ? "yaba" : "surulere";
    expect(store.observations[0].scopeRef).toBe(first);
  });

  it("a failed pattern job is reported as an error (#4)", async () => {
    const store = new MemoryStore();
    store.replaceHourPatterns = async () => {
      throw new Error("db down");
    };
    g.__lightDeyStore = store;
    process.env.SOURCE_NISO_ENABLED = "0";
    process.env.SOURCE_IKEJA_NOTICES_ENABLED = "0";
    try {
      const r = await refreshDueSources({ snapshot: "always" });
      expect(r.patterns).toBe("error");
      expect(r.errors).toBe(1);
    } finally {
      delete process.env.SOURCE_NISO_ENABLED;
      delete process.env.SOURCE_IKEJA_NOTICES_ENABLED;
    }
  });

  it("key issuing derives trust tier from the id/kind; a verified reporter can't get tier 1 (#6)", async () => {
    const { validateSourceSpec } = await import("../../scripts/partner-key-rules.mjs");
    expect(validateSourceSpec({ id: "verified:ada-yaba", kind: "verified_reporter" })).toEqual({ tier: 2 });
    expect(validateSourceSpec({ id: "partner:acme-estate", kind: "verified_partner" })).toEqual({ tier: 1 });
    expect(() => validateSourceSpec({ id: "verified:ada-yaba", kind: "verified_reporter", tier: "1" })).toThrow(/always tier 2/);
    expect(() => validateSourceSpec({ id: "verified:ada-yaba", kind: "verified_partner" })).toThrow(/verified_reporter/);
    expect(() => validateSourceSpec({ id: "partner:acme", kind: "verified_reporter" })).toThrow(/verified_partner or official_disco/);
    expect(() => validateSourceSpec({ id: "verified_reporters", kind: "verified_reporter" })).toThrow(/--id/);
  });
});

describe("Qodo pass 3 on PR #3", () => {
  const feed = (items: string) => `<?xml version="1.0"?><rss version="2.0"><channel><title>IE</title>${items}</channel></rss>`;
  const item = (open: string, t: string) => `${open}<title>${t}</title><link>https://www.ikejaelectric.com/${t}</link><pubDate>Fri, 13 Nov 2026 10:00:00 +0000</pubDate><description><![CDATA[Works in Shomolu]]></description></item>`;

  it("extracts items whose tag has attributes or whitespace instead of dropping them (#1)", () => {
    const items = parseRss(feed(item('<item rdf:about="x">', "a") + item("<item >", "b") + item("<item>", "c")));
    expect(items.map((i) => i.title)).toEqual(["a", "b", "c"]);
    expect(items[0].text).toBe("Works in Shomolu");
  });
  it("markup-like text inside CDATA can't break or fake the structure (#1)", () => {
    const tricky = `<item><title>t</title><link>https://www.ikejaelectric.com/t</link><pubDate>Fri, 13 Nov 2026 10:00:00 +0000</pubDate><description><![CDATA[see <item> and </item> here]]></description></item>`;
    const items = parseRss(feed(tricky));
    expect(items).toHaveLength(1);
    expect(items[0].text).toBe("see and here");
  });

  it("writes the audit row in the same write as the observation, only when it changes (#2)", async () => {
    const store = new MemoryStore();
    const row = { sourceId: "verified:ada", externalId: "e1", scope: "neighbourhood" as const, scopeRef: "yaba", kind: "status_report" as const, status: "off" as const, valueNum: null, title: null, url: null, observedAt: new Date().toISOString(), validUntil: new Date(Date.now() + 3_600_000).toISOString(), neighbourhoodIds: [] };
    const audit = { audit: { event: "partner_ingested" as const, actor: "key:k1" } };
    expect(await store.upsertObservations([row], audit)).toBe(1);
    expect(await store.upsertObservations([row], audit)).toBe(0);
    expect(store.events).toEqual([{ event: "partner_ingested", actor: "key:k1" }]);
  });

  it("the quota log keeps only the last hour (#3)", async () => {
    const store = new MemoryStore();
    const t0 = new Date("2026-11-14T10:00:00Z");
    for (let i = 0; i < 5; i++) await store.consumePartnerQuota("k", 120, t0);
    await store.consumePartnerQuota("k", 120, new Date(t0.getTime() + 2 * 3_600_000));
    expect((store as unknown as { quota: Map<string, number[]> }).quota.get("k")).toHaveLength(1);
  });
});

describe("cron endpoint", () => {
  it("requires CRON_SECRET", async () => {
    process.env.CRON_SECRET = "s3cret-value-for-tests";
    try {
      const req = (auth?: string) => new NextRequest("http://localhost/api/cron/refresh", { headers: auth ? { authorization: auth } : {} });
      expect((await cron(req())).status).toBe(401);
      expect((await cron(req("Bearer wrong"))).status).toBe(401);
    } finally {
      delete process.env.CRON_SECRET;
    }
    expect((await cron(new NextRequest("http://localhost/api/cron/refresh", { headers: { authorization: "Bearer " } }))).status).toBe(401);
  });
});

describe("Qodo pass 4 on PR #3", () => {
  it("a failed batch writes nothing — no partial evidence from a failed run (#1)", async () => {
    const store = new MemoryStore();
    const now = Date.now();
    const row = (externalId: string, scopeRef: string) => ({ sourceId: "niso_niggrid", externalId, scope: "disco" as const, scopeRef, kind: "disco_allocation" as const, status: "off" as const, valueNum: 0, title: null, url: null, observedAt: new Date(now).toISOString(), validUntil: new Date(now + 3_600_000).toISOString(), neighbourhoodIds: [] });
    await store.upsertObservations([row("existing", "eko")]);
    // second row tries to move "existing" to another scope => whole batch must roll back
    await expect(store.upsertObservations([row("fresh", "eko"), row("existing", "ikeja")])).rejects.toThrow();
    expect(store.observations.map((o) => o.externalId)).toEqual(["existing"]);
  });

  it("patterns are built per area, and an area whose history hit the cap is skipped, not estimated (#2)", async () => {
    const { recomputePatterns, REPORT_QUERY_CAP } = await import("@/lib/ingest/runner");
    const store = new MemoryStore();
    const calls: (string | undefined)[] = [];
    const now = new Date();
    store.listReports = async ({ areaId }) => {
      calls.push(areaId);
      if (areaId === "yaba") return Array.from({ length: REPORT_QUERY_CAP }, (_, i) => ({ id: `r${i}`, areaId: "yaba", status: "on" as const, reporterId: `u${i}`, networkHash: `n${i}`, createdAt: new Date(now.getTime() - 3_600_000).toISOString(), verification: "unverified" as const }));
      return [];
    };
    const n = await recomputePatterns(store, now);
    expect(calls.every((c) => typeof c === "string")).toBe(true); // never one unbounded all-area query
    expect(calls).toHaveLength(41);
    expect(n).toBe(0); // the capped area produced no pattern
  });
});
