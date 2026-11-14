import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { POST as heartbeatRoute } from "@/app/api/sensors/heartbeat/route";
import { GET as getStatus } from "@/app/api/status/route";
import { EVIDENCE_CONFIG } from "@/lib/config";
import { resolveAreaStatus } from "@/lib/evidence";
import { iodaObservations, parseIodaEvents } from "@/lib/ingest/ioda";
import { ADAPTERS, runAdapter } from "@/lib/ingest/runner";
import { allowNetwork, isKnownUnknown, readBodyLimited, resetGuard } from "@/lib/sensors/guard";
import { deviceHealth, type DeviceRow } from "@/lib/sensors/health";
import { ingestHeartbeat } from "@/lib/sensors/ingest";
import { deviceSecret, signBody } from "@/lib/sensors/protocol";
import { aggregateAreaStatus } from "@/lib/status";
import { MemoryStore } from "@/lib/store/memory";
import type { Observation, Overview, SensorState } from "@/lib/types";
import { NOW, rep } from "./helpers";

process.env.SENSOR_MASTER_SECRET = "test-master-secret-0123456789abcdefghijklmnop";
const T = NOW.getTime();
const iso = (minAgo: number) => new Date(T - minAgo * 60_000).toISOString();

let n = 0;
const sensor = (areaId: string, mains: "on" | "off", p: Partial<SensorState> = {}): SensorState => ({
  deviceId: `ldd_${String(++n).padStart(16, "0")}`,
  areaId,
  provider: "light_dey_v1",
  supplyPoint: "grid_direct",
  mains,
  powerSource: mains === "on" ? "grid" : "battery",
  observedAt: iso(1),
  health: "good",
  healthReasons: [],
  networkHash: `net-${n}`,
  ...p,
});
const resolve = (areaId: string, sensors: SensorState[], observations: Observation[] = [], reports = [] as ReturnType<typeof rep>[]) =>
  resolveAreaStatus({ community: aggregateAreaStatus(areaId, reports, NOW), observations, sensors, now: NOW });
const eko0: Observation = { id: "o", sourceId: "niso_niggrid", externalId: "x", scope: "disco", scopeRef: "eko", kind: "disco_allocation", status: "off", valueNum: 0, title: null, url: null, observedAt: iso(5), validUntil: new Date(T + 3_600_000).toISOString(), neighbourhoodIds: [], tier: 1, sourceKind: "official_grid" };

describe("sensor evidence in the engine", () => {
  it("one healthy grid-direct sensor => Confirmed (measured), medium confidence, no reports needed", () => {
    const s = resolve("ikeja", [sensor("ikeja", "on")]);
    expect(s.mapState).toBe("CONFIRMED_ON");
    expect(s.confidence).toBe("medium");
    expect(s.evidence?.[0]).toMatchObject({ sourceId: "light_dey_sensor", evidenceType: "measured", role: "decisive", count: 1 });
    expect(s.explanation).toMatch(/^Measured: 1 sensor detects grid power/);
    expect(s.sensors).toEqual({ total: 1, online: 1, offline: 0 });
  });
  it("independent sensors (separate networks) raise confidence; repeats from one network don't", () => {
    expect(resolve("ikeja", [sensor("ikeja", "on"), sensor("ikeja", "on")]).confidence).toBe("high");
    expect(resolve("ikeja", [sensor("ikeja", "on", { networkHash: "same" }), sensor("ikeja", "on", { networkHash: "same" })]).confidence).toBe("medium");
  });
  it("UPS false positive: device on battery with mains off => Confirmed outage", () => {
    const s = resolve("ikeja", [sensor("ikeja", "off", { powerSource: "ups" })]);
    expect(s.mapState).toBe("CONFIRMED_OFF");
  });
  it("generator false positive: power after a changeover is NOT grid evidence", () => {
    const s = resolve("ikeja", [sensor("ikeja", "on", { supplyPoint: "after_changeover", powerSource: "generator" })]);
    expect(s.mapState).toBe("UNKNOWN");
    expect(s.evidence?.find((e) => e.sourceId === "light_dey_sensor")?.summary).toMatch(/could be generator/);
  });
  it("no power after a changeover (grid AND generator off) => Likely outage, not confirmed", () => {
    expect(resolve("ikeja", [sensor("ikeja", "off", { supplyPoint: "after_changeover" })]).mapState).toBe("LIKELY_OFF");
  });
  it("a degraded sensor => Likely, not Confirmed", () => {
    const s = resolve("ikeja", [sensor("ikeja", "off", { health: "degraded", healthReasons: ["device clock off"] })]);
    expect(s.mapState).toBe("LIKELY_OFF");
    expect(s.explanation).toMatch(/device clock off/);
  });
  it("sensor silence is never an outage", () => {
    const s = resolve("ikeja", [sensor("ikeja", "off", { health: "offline", observedAt: iso(40) })]);
    expect(s.mapState).toBe("UNKNOWN");
    expect(s.explanation).toMatch(/sensors here are offline, and silence isn't an outage/);
    expect(s.sensors).toEqual({ total: 1, online: 0, offline: 1 });
  });
  it("strong sensors that disagree => Conflicting (different feeders)", () => {
    expect(resolve("ikeja", [sensor("ikeja", "on"), sensor("ikeja", "off")]).mapState).toBe("CONFLICTING");
  });
  it("official outage vs a healthy sensor measuring power => Conflicting, uncertainty preserved", () => {
    expect(resolve("ajah", [sensor("ajah", "on")], [eko0]).mapState).toBe("CONFLICTING");
  });
  it("official outage + sensor agreeing => Confirmed, high confidence", () => {
    const s = resolve("ajah", [sensor("ajah", "off")], [eko0]);
    expect(s.mapState).toBe("CONFIRMED_OFF");
    expect(s.confidence).toBe("high");
  });
  it("neighbours contradicting a measured status lower confidence but don't override it", () => {
    const s = resolve("ikeja", [sensor("ikeja", "off")], [], ["a", "b", "c"].map((w, i) => rep("on", i + 1, w, { areaId: "ikeja" })));
    expect(s.mapState).toBe("CONFIRMED_OFF");
    expect(s.confidence).toBe("low");
    expect(s.evidence?.find((e) => e.sourceId === "community")?.role).toBe("conflicting");
  });
  it("a sensor only covers its own neighbourhood", () => {
    expect(resolve("yaba", [sensor("ikeja", "off")]).mapState).toBe("UNKNOWN");
  });
  it("a live sensor reading suppresses history estimates", () => {
    const s = resolveAreaStatus({ community: aggregateAreaStatus("agege", [], NOW), observations: [], sensors: [sensor("agege", "off", { health: "degraded", healthReasons: ["heartbeat late"] })], pattern: { areaId: "agege", hour: 13, lightHours: 10, knownHours: 10, computedAt: NOW.toISOString() }, now: NOW });
    expect(s.mapState).toBe("LIKELY_OFF");
  });
  it("Lagos-wide connectivity (IODA proxy) is context only and never changes a status", () => {
    const ioda: Observation = { ...eko0, id: "i", sourceId: "ioda", externalId: "ping:1", scope: "national", scopeRef: null, kind: "connectivity", status: null, valueNum: 4000, title: "Lagos-wide internet connectivity drop", tier: 4, sourceKind: "proxy" };
    const s = resolve("yaba", [], [ioda]);
    expect(s.mapState).toBe("UNKNOWN");
    expect(s.evidence?.[0]).toMatchObject({ role: "context", evidenceType: "proxy" });
  });
});

describe("Yaba — evidence decides immediately, never hard-coded", () => {
  it("no evidence => Not enough current evidence", () => expect(resolve("yaba", []).mapState).toBe("UNKNOWN"));
  it("one healthy Yaba sensor reading no mains => Confirmed outage at once (no 3-person wait)", () => {
    const s = resolve("yaba", [sensor("yaba", "off")]);
    expect(s.mapState).toBe("CONFIRMED_OFF");
    expect(s.evidence?.[0]).toMatchObject({ sourceId: "light_dey_sensor", evidenceType: "measured", observedAt: iso(1) });
  });
  it("only weak Yaba evidence => Likely outage, never Confirmed", () => {
    expect(resolve("yaba", [sensor("yaba", "off", { supplyPoint: "after_changeover" })]).mapState).toBe("LIKELY_OFF");
  });
  it("conflicting Yaba sensors => Conflicting, never Confirmed", () => {
    expect(resolve("yaba", [sensor("yaba", "off"), sensor("yaba", "on")]).mapState).toBe("CONFLICTING");
  });
  it("an Eko DisCo outage still doesn't reach unmapped Yaba", () => expect(resolve("yaba", [], [eko0]).mapState).toBe("UNKNOWN"));
});

describe("device health", () => {
  const row = (p: Partial<DeviceRow>): DeviceRow => ({ deviceId: "ldd_0000000000000001", areaId: "yaba", provider: "light_dey_v1", supplyPoint: "grid_direct", lastHeartbeatAt: iso(1), mains: "on", powerSource: "grid", batteryPct: null, clockSkewS: 0, selfTest: "pass", networkHash: "n", ...p });
  it.each([
    [{}, "good"],
    [{ lastHeartbeatAt: iso(12) }, "degraded"],
    [{ lastHeartbeatAt: iso(20) }, "offline"],
    [{ lastHeartbeatAt: null }, "offline"],
    [{ clockSkewS: 200 }, "degraded"],
    [{ mains: "off", powerSource: "battery", batteryPct: 10 }, "degraded"],
    [{ selfTest: "fail" }, "degraded"],
    [{ mains: "unknown" }, "degraded"],
  ] as const)("%o => %s", (p, h) => expect(deviceHealth(row(p as Partial<DeviceRow>), T).health).toBe(h));
});

describe("heartbeat protocol (signed, replay- and rate-limited)", () => {
  const ID = "ldd_TESTDEVICE00000001";
  let store: MemoryStore;
  beforeEach(() => {
    resetGuard();
    store = new MemoryStore();
    store.devices.set(ID, { deviceId: ID, areaId: "yaba", provider: "light_dey_v1", supplyPoint: "grid_direct", lastHeartbeatAt: null, mains: null, powerSource: null, batteryPct: null, clockSkewS: null, selfTest: null, networkHash: null, revoked: false });
  });
  const body = (p: Record<string, unknown> = {}, at = NOW) => JSON.stringify({ v: 1, deviceId: ID, ts: Math.floor(at.getTime() / 1000), nonce: `nonce-${Math.random().toString(36).slice(2)}-padding`, mains: "off", powerSource: "ups", ...p });
  const signed = (b: string) => signBody(b, deviceSecret(ID));

  it("accepts a valid heartbeat and updates device state", async () => {
    const b = body();
    expect(await ingestHeartbeat(store, b, signed(b), "net", NOW)).toEqual({ ok: true });
    expect(store.devices.get(ID)).toMatchObject({ mains: "off", powerSource: "ups", lastHeartbeatAt: NOW.toISOString() });
  });
  it("rejects bad signatures, unknown and revoked devices with the same generic 401", async () => {
    const b = body();
    expect(await ingestHeartbeat(store, b, signBody(b, "wrong-secret"), "net", NOW)).toMatchObject({ status: 401, code: "unauthorized" });
    const other = body({ deviceId: "ldd_UNKNOWNDEVICE00001" });
    expect(await ingestHeartbeat(store, other, signBody(other, deviceSecret("ldd_UNKNOWNDEVICE00001")), "net", NOW)).toMatchObject({ status: 401 });
    store.devices.get(ID)!.revoked = true;
    expect(await ingestHeartbeat(store, b, signed(b), "net", NOW)).toMatchObject({ status: 401 });
  });
  it("rejects a replayed nonce", async () => {
    const b = body();
    await ingestHeartbeat(store, b, signed(b), "net", NOW);
    const later = new Date(T + 60_000);
    expect(await ingestHeartbeat(store, b, signed(b), "net", later)).toMatchObject({ status: 409, code: "replay" });
  });
  it("rate-limits a chatty device", async () => {
    const a = body();
    await ingestHeartbeat(store, a, signed(a), "net", NOW);
    const b = body({}, new Date(T + 5_000));
    expect(await ingestHeartbeat(store, b, signed(b), "net", new Date(T + 5_000))).toMatchObject({ status: 429 });
  });
  it("rejects stale or future timestamps", async () => {
    const old = body({}, new Date(T - 10 * 60_000));
    expect(await ingestHeartbeat(store, old, signed(old), "net", NOW)).toMatchObject({ status: 401, code: "stale" });
  });
  it("rejects oversized and invalid bodies", async () => {
    expect((await ingestHeartbeat(store, "x".repeat(5000), null, "net", NOW)) as { status: number }).toMatchObject({ status: 413 });
    const bad = body({ mains: "maybe" });
    expect(await ingestHeartbeat(store, bad, signed(bad), "net", NOW)).toMatchObject({ status: 400 });
  });

  it("end to end: a signed heartbeat on the API turns Yaba into a measured outage", async () => {
    (globalThis as unknown as { __lightDeyStore?: MemoryStore }).__lightDeyStore = store;
    const b = body({}, new Date());
    const res = await heartbeatRoute(new NextRequest("http://localhost/api/sensors/heartbeat", { method: "POST", body: b, headers: { "content-type": "application/json", "x-lightdey-signature": signed(b) } }));
    expect(res.status).toBe(202);
    const o = (await (await getStatus()).json()) as Overview;
    const yaba = o.statuses.find((s) => s.areaId === "yaba")!;
    expect(yaba.mapState).toBe("CONFIRMED_OFF");
    expect(yaba.evidence?.[0]).toMatchObject({ sourceId: "light_dey_sensor", evidenceType: "measured" });
    expect(JSON.stringify(yaba)).not.toContain(ID); // device ids never leave the server
  });
});

describe("IODA proxy adapter (opt-in)", () => {
  const FIX = readFileSync("tests/fixtures/ioda-lagos-events.json", "utf8");
  it("parses real Lagos events and only emits context (status null) for ongoing ones", () => {
    const events = parseIodaEvents(FIX);
    expect(events.length).toBe(12);
    const at = new Date((events[0].start + 60) * 1000);
    const obs = iodaObservations(events, at);
    expect(obs.length).toBeGreaterThan(0);
    for (const o of obs) expect(o).toMatchObject({ kind: "connectivity", status: null, scope: "national" });
    expect(iodaObservations(events, new Date("2027-06-01T00:00:00Z"))).toEqual([]);
  });
  it("rejects unexpected shapes", () => {
    expect(() => parseIodaEvents('{"type":"other","data":[]}')).toThrow(/unexpected/);
  });
  it("stays OFF unless SOURCE_IODA_ENABLED=1", async () => {
    const ioda = ADAPTERS.find((a) => a.sourceId === "ioda")!;
    const store = new MemoryStore();
    expect((await runAdapter(store, ioda, { fetcher: async () => ({ status: 200, text: FIX }) })).status).toBe("skipped");
    process.env.SOURCE_IODA_ENABLED = "1";
    try {
      expect((await runAdapter(store, ioda, { fetcher: async () => ({ status: 200, text: FIX }), force: true })).status).toBe("ok");
    } finally {
      delete process.env.SOURCE_IODA_ENABLED;
    }
  });
});

describe("status timeline", () => {
  it("records changes with their deciding evidence, newest first", async () => {
    const store = new MemoryStore();
    const st = (mapState: "UNKNOWN" | "CONFIRMED_OFF") => ({ areaId: "yaba", mapState, confidence: "medium", freshness: "fresh", evidence: mapState === "UNKNOWN" ? [] : [{ role: "decisive", sourceName: "Light Dey sensors", summary: "1 healthy sensor measures no grid power" }] });
    await store.recordSnapshotChanges([st("UNKNOWN")]);
    await store.recordSnapshotChanges([st("CONFIRMED_OFF")]);
    const t = await store.listSnapshots("yaba", new Date(0));
    expect(t.map((x) => x.mapState)).toEqual(["CONFIRMED_OFF", "UNKNOWN"]);
    expect(t[0].basis).toBe("Light Dey sensors: 1 healthy sensor measures no grid power");
    void EVIDENCE_CONFIG;
  });
});

describe("Qodo pass 4 on PR #5", () => {
  it("long IODA outages stay current while ongoing (#11)", () => {
    const start = Math.floor(T / 1000) - 3 * 3600; // began 3 h ago, still going
    const [o] = iodaObservations([{ location: "region/2935", start, duration: 4 * 3600, datasource: "ping-slash24", score: 1 }], NOW);
    expect(o.observedAt).toBe(NOW.toISOString());
    expect(o.title).toMatch(/since \d\d:\d\d UTC/);
  });
  it("unknown device ids are cached and the network bucket limits floods before the DB (#9)", async () => {
    resetGuard();
    const store = new MemoryStore();
    let lookups = 0;
    const orig = store.getDevice.bind(store);
    store.getDevice = async (id) => (lookups++, orig(id));
    const b = JSON.stringify({ v: 1, deviceId: "ldd_NOSUCHDEVICE000000X", ts: Math.floor(T / 1000), nonce: "nonce-aaaaaaaaaaaaaaaa", mains: "off", powerSource: "ups" });
    for (let i = 0; i < 5; i++) await ingestHeartbeat(store, b, "v1=" + "0".repeat(64), "net", NOW);
    expect(lookups).toBe(1);
    expect(isKnownUnknown("ldd_NOSUCHDEVICE000000X", T)).toBe(true);
    let allowed = 0;
    for (let i = 0; i < 100; i++) if (allowNetwork("flood", T)) allowed++;
    expect(allowed).toBe(30);
  });
  it("the body budget is enforced while streaming (#8)", async () => {
    const big = new Blob(["x".repeat(10_000)]).stream();
    expect(await readBodyLimited(big, 2048)).toBeNull();
    expect(await readBodyLimited(new Blob(["{}"]).stream(), 2048)).toBe("{}");
    const res = await heartbeatRoute(new NextRequest("http://localhost/api/sensors/heartbeat", { method: "POST", body: "x".repeat(5000), headers: { "content-type": "application/json", "content-length": "5000" } }));
    expect(res.status).toBe(413);
  });
  it("prune uses the configured retention (#13)", async () => {
    const { SENSOR_CONFIG } = await import("@/lib/config");
    expect(SENSOR_CONFIG.nonceTtlMinutes).toBe(60);
    const store = new MemoryStore();
    store.heartbeats.push({ receivedAt: new Date(T - (SENSOR_CONFIG.heartbeatRetentionDays + 1) * 86_400_000) } as never, { receivedAt: new Date(T - 3_600_000) } as never);
    expect((await store.pruneSensorData(NOW)).heartbeats).toBe(1);
  });
});

describe("reference Python client (#7, #10)", () => {
  it("survives a network failure (exit 1 with a message, no traceback) and never infers its own power source", async () => {
    const { spawnSync } = await import("node:child_process");
    const r = spawnSync("python3", ["-I", "scripts/sensor/light_dey_sensor.py", "--url", "http://127.0.0.1:9", "--test-mains", "off", "--once"], {
      env: { ...process.env, LIGHTDEY_DEVICE_ID: "ldd_TESTDEVICE00000001", LIGHTDEY_DEVICE_SECRET: "s" },
      encoding: "utf8",
      timeout: 30_000,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/network error/);
    expect(r.stderr).not.toMatch(/Traceback/);
    const src = readFileSync("scripts/sensor/light_dey_sensor.py", "utf8");
    expect(src).not.toMatch(/def power_source/);
    expect(src).toMatch(/--device-supply/);
  });
});
