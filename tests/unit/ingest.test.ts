import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { GET as cron } from "@/app/api/cron/refresh/route";
import { POST as ingest } from "@/app/api/ingest/observations/route";
import { fetchWithRetry, type Fetcher } from "@/lib/ingest/http";
import { areasMentioned, noticeObservations, parseRss } from "@/lib/ingest/ikejaNotices";
import { niggridObservations, parseDiscoLoadProfile, parseLagosDateTime } from "@/lib/ingest/niggrid";
import { ADAPTERS, runAdapter, snapshotChanges } from "@/lib/ingest/runner";
import { hashKey } from "@/lib/partner";
import { MemoryStore } from "@/lib/store/memory";

const NIGGRID = readFileSync("tests/fixtures/niggrid-disco-load-profile.html", "utf8");
const FEED = readFileSync("tests/fixtures/ikeja-electric-feed.xml", "utf8");
const AT = new Date("2026-11-13T19:20:00Z"); // 20:20 Lagos, 13 min after the fixture's "as at"
const niso = ADAPTERS.find((a) => a.sourceId === "niso_niggrid")!;
const ie = ADAPTERS.find((a) => a.sourceId === "ikeja_electric_notices")!;
const ok = (text: string): Fetcher => async () => ({ status: 200, text });

describe("NIGGRID parser (real page fixture)", () => {
  it("reads the timestamp in Lagos time and every DisCo row", () => {
    expect(parseLagosDateTime("13/11/2026 20:07:00")).toBe("2026-11-13T19:07:00.000Z");
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
    expect(Date.parse(obs[0].validUntil) - Date.parse(obs[0].observedAt)).toBe(45 * 60_000);
  });
  it("fails loudly (no data) when the layout changes", () => {
    expect(() => parseDiscoLoadProfile("<html>maintenance</html>", AT)).toThrow(/timestamp not found/);
    expect(() => parseDiscoLoadProfile(NIGGRID.replace("Eko Disco", "EKO"), AT)).toThrow(/'Eko Disco' row missing/);
    expect(() => parseDiscoLoadProfile(NIGGRID.replace("482.00", "n/a"), AT)).toThrow(/bad row/);
    expect(() => parseDiscoLoadProfile(NIGGRID, new Date("2026-11-13T10:00:00Z"))).toThrow(/future/);
    expect(() => parseDiscoLoadProfile(NIGGRID.replace("482.00", "999.00"), AT)).toThrow(/page total/);
  });
});

describe("Ikeja Electric notices (real feed fixture)", () => {
  it("parses items and matches supported areas by name only", () => {
    const items = parseRss(FEED);
    expect(items).toHaveLength(5);
    const shomolu = items.find((i) => /Shomolu/.test(i.title + i.text))!;
    expect(areasMentioned(shomolu.title + " " + shomolu.text)).toContain("shomolu");
    expect(areasMentioned("Victoria Garden City")).toEqual([]); // no 'vi' alias false positive
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
  it("rejects non-RSS responses", () => {
    expect(() => parseRss("<html>blocked</html>")).toThrow(/not RSS/);
  });
});

describe("runner: retries, leases, failures, idempotency", () => {
  let store: MemoryStore;
  beforeEach(() => (store = new MemoryStore()));

  it("retries 5xx then succeeds; gives up after 3 attempts; does not retry 404", async () => {
    let calls = 0;
    const flaky: Fetcher = async () => (++calls < 3 ? { status: 503, text: "" } : { status: 200, text: "ok" });
    expect((await fetchWithRetry(flaky, "u", [], 3, 1)).attempts).toBe(3);
    calls = 0;
    await expect(fetchWithRetry(async () => ({ status: 500, text: "" }), "u", [], 3, 1)).rejects.toThrow(/HTTP 500/);
    let n404 = 0;
    await expect(fetchWithRetry(async () => (n404++, { status: 404, text: "" }), "u", [], 3, 1)).rejects.toThrow();
    expect(n404).toBe(1);
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
  let store: MemoryStore;
  beforeEach(() => {
    store = new MemoryStore();
    store.partnerKeys.set(hashKey(KEY), { sourceId: "verified:ada", tier: 2 });
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
  it("stores a tier-2 observation once (idempotent) and logs a verification event", async () => {
    const b = body();
    expect((await call(b)).status).toBe(201);
    expect((await call(b)).status).toBe(200);
    expect(store.observations).toHaveLength(1);
    expect(store.observations[0]).toMatchObject({ sourceId: "verified:ada", tier: 2, scopeRef: "yaba", status: "off" });
    expect(store.events).toHaveLength(1);
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
