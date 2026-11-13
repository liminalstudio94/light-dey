import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { POST as postReport } from "@/app/api/reports/route";
import { GET as getStatus } from "@/app/api/status/route";
import { MemoryStore } from "@/lib/store/memory";
import type { Overview } from "@/lib/types";

const g = globalThis as unknown as { __lightDeyStore?: MemoryStore };
let store: MemoryStore;
beforeEach(() => {
  store = new MemoryStore();
  g.__lightDeyStore = store;
});

const send = (body: unknown, who: string, ip: string, origin?: string) =>
  postReport(
    new NextRequest("http://localhost/api/reports", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", "x-real-ip": ip, cookie: `ld_rid=${who}`, ...(origin ? { origin } : {}) },
    }),
  );
const uid = (n: number) => `0000000${n}-0000-4000-8000-000000000000`.slice(-36);
const status = async () => (await (await getStatus()).json()) as Overview;
const area = (o: Overview, id: string) => o.statuses.find((s) => s.areaId === id)!;

describe("API integration (route handlers + store + engine)", () => {
  it("report flow: 1 report => UNKNOWN, 3 independent => COMMUNITY_OFF, attribution present", async () => {
    expect((await send({ areaId: "yaba", status: "off" }, uid(1), "1.1.1.1")).status).toBe(201);
    expect(area(await status(), "yaba").mapState).toBe("UNKNOWN");
    await send({ areaId: "yaba", status: "off" }, uid(2), "2.2.2.2");
    await send({ areaId: "yaba", status: "off" }, uid(3), "3.3.3.3");
    const s = area(await status(), "yaba");
    expect(s.mapState).toBe("COMMUNITY_OFF");
    expect(s.evidence?.[0]).toMatchObject({ sourceId: "community", count: 3 });
  });

  it("duplicate and cross-origin submissions are rejected and don't count", async () => {
    await send({ areaId: "yaba", status: "off" }, uid(1), "1.1.1.1");
    expect((await send({ areaId: "yaba", status: "off" }, uid(1), "1.1.1.1")).status).toBe(409);
    expect((await send({ areaId: "yaba", status: "off" }, uid(2), "2.2.2.2", "https://evil.example")).status).toBe(403);
    expect(area(await status(), "yaba").offReporters).toBe(1);
  });

  it("official observations in the store flow through to the API with grid context", async () => {
    const now = Date.now();
    await store.upsertObservations([
      { sourceId: "niso_niggrid", externalId: "disco:eko:t", scope: "disco", scopeRef: "eko", kind: "disco_allocation", status: "off", valueNum: 0, title: null, url: "https://www.niggrid.org/DisCoLoadProfile", observedAt: new Date(now - 300_000).toISOString(), validUntil: new Date(now + 2_400_000).toISOString(), neighbourhoodIds: [] },
      { sourceId: "niso_niggrid", externalId: "disco:ikeja:t", scope: "disco", scopeRef: "ikeja", kind: "disco_allocation", status: null, valueNum: 493, title: null, url: "https://www.niggrid.org/DisCoLoadProfile", observedAt: new Date(now - 300_000).toISOString(), validUntil: new Date(now + 2_400_000).toISOString(), neighbourhoodIds: [] },
    ]);
    const o = await status();
    expect(area(o, "ajah").mapState).toBe("CONFIRMED_OFF");
    expect(area(o, "yaba").mapState).toBe("UNKNOWN");
    expect(area(o, "ikeja").mapState).toBe("UNKNOWN");
    expect(o.grid?.discos.find((d) => d.id === "ikeja")?.mw).toBe(493);
    expect(o.mapCounts?.CONFIRMED_OFF).toBe(7); // the 7 officially mapped Eko areas
  });

  it("observation upserts are idempotent", async () => {
    const row = { sourceId: "niso_niggrid", externalId: "x", scope: "national" as const, scopeRef: null, kind: "grid_total" as const, status: null, valueNum: 3000, title: null, url: null, observedAt: new Date().toISOString(), validUntil: new Date(Date.now() + 60_000).toISOString(), neighbourhoodIds: [] };
    expect(await store.upsertObservations([row])).toBe(1);
    expect(await store.upsertObservations([row])).toBe(0);
    expect(store.observations).toHaveLength(1);
  });
});
