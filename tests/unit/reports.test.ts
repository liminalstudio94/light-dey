import { describe, expect, it } from "vitest";
import { submitReport } from "@/lib/reports";
import { MemoryStore } from "@/lib/store/memory";
import { NOW } from "./helpers";

const ctx = (reporterId = "u1", networkHash = "n1", now = NOW) => ({ reporterId, networkHash, now });
const at = (min: number) => new Date(NOW.getTime() + min * 60_000);

describe("submitReport", () => {
  it("accepts a valid report", async () => {
    const store = new MemoryStore();
    const r = await submitReport(store, { areaId: "yaba", status: "on" }, ctx());
    expect(r.ok).toBe(true);
    expect((await store.listReports({ since: new Date(0) })).length).toBe(1);
  });

  it.each([
    [{ areaId: "atlantis", status: "on" }, "Unknown neighbourhood"],
    [{ areaId: "yaba", status: "maybe" }],
    [{ areaId: "yaba" }],
    [{ areaId: "yaba", status: "on", lat: 6.5 }],
    [{ areaId: "yaba", status: "on", lat: 200, lng: 3 }],
    [{ areaId: "yaba", status: "on", comment: "x".repeat(141) }],
    [{ areaId: "yaba", status: "on", comment: "visit www.spam.com" }],
    [{ areaId: "yaba", status: "on", website: "bot-filled" }],
    ["not an object"],
  ])("rejects invalid input %#", async (body, msg?: string) => {
    const store = new MemoryStore();
    const r = await submitReport(store, body, ctx());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(400);
      if (msg) expect(r.message).toBe(msg);
    }
    expect((await store.listReports({ since: new Date(0) })).length).toBe(0);
  });

  it("rejects a duplicate within 10 minutes, allows it after", async () => {
    const store = new MemoryStore();
    expect((await submitReport(store, { areaId: "yaba", status: "on" }, ctx())).ok).toBe(true);
    const dup = await submitReport(store, { areaId: "yaba", status: "on" }, ctx("u1", "n1", at(9)));
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.code).toBe("duplicate");
    expect((await submitReport(store, { areaId: "yaba", status: "on" }, ctx("u1", "n1", at(11)))).ok).toBe(true);
  });

  it("allows the opposite status (light changed) inside the duplicate window", async () => {
    const store = new MemoryStore();
    await submitReport(store, { areaId: "yaba", status: "on" }, ctx());
    expect((await submitReport(store, { areaId: "yaba", status: "off" }, ctx("u1", "n1", at(3)))).ok).toBe(true);
  });

  it("rate limits one reporter across areas", async () => {
    const store = new MemoryStore();
    const areas = ["yaba", "ikeja", "surulere", "ajah", "ikoyi", "agege", "festac"];
    const results = [];
    for (const [i, areaId] of areas.entries()) results.push(await submitReport(store, { areaId, status: "on" }, ctx("u1", "n1", at(i))));
    expect(results.slice(0, 6).every((r) => r.ok)).toBe(true);
    const last = results[6];
    expect(last.ok).toBe(false);
    if (!last.ok) expect(last.status).toBe(429);
  });

  it("rate limits one network even with fresh reporter ids", async () => {
    const store = new MemoryStore();
    let blocked = 0;
    for (let i = 0; i < 31; i++) {
      const r = await submitReport(store, { areaId: "yaba", status: "on" }, ctx(`u${i}`, "shared"));
      if (!r.ok) blocked++;
    }
    expect(blocked).toBe(1);
  });

  it("marks GPS within range as location_matched, far away as mismatch", async () => {
    const store = new MemoryStore();
    const near = await submitReport(store, { areaId: "yaba", status: "on", lat: 6.51, lng: 3.372 }, ctx("a"));
    const far = await submitReport(store, { areaId: "yaba", status: "on", lat: 6.43, lng: 3.42 }, ctx("b"));
    expect(near.ok && near.report.verification).toBe("location_matched");
    expect(far.ok && far.report.verification).toBe("location_mismatch");
  });
});
