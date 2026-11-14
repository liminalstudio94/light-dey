// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AreaLive } from "@/components/AreaLive";
import { AREAS } from "@/lib/areas";
import { resolveAreaStatus } from "@/lib/evidence";
import { aggregateAreaStatus } from "@/lib/status";
import type { Observation, Overview } from "@/lib/types";
import { NOW, rep } from "./helpers";

vi.mock("@/components/LagosMap", () => ({ LagosMap: () => null }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

const overview = (statuses: Overview["statuses"]): Overview => ({
  statuses: AREAS.map((a) => statuses.find((s) => s.areaId === a.id) ?? resolveAreaStatus({ community: aggregateAreaStatus(a.id, [], NOW), observations: [], now: NOW })),
  counts: { LIGHT: 0, NO_LIGHT: 0, UNCERTAIN: 0, UNKNOWN: 0 },
  recent: [],
  reportsLast24h: 0,
  reportersLast24h: 0,
  areasReportedLast24h: 0,
  generatedAt: NOW.toISOString(),
  storeKind: "memory",
  grid: null,
});
const eko0: Observation = { id: "o", sourceId: "niso_niggrid", externalId: "x", scope: "disco", scopeRef: "eko", kind: "disco_allocation", status: "off", valueNum: 0, title: null, url: "https://www.niggrid.org/DisCoLoadProfile", observedAt: new Date(NOW.getTime() - 300_000).toISOString(), validUntil: new Date(NOW.getTime() + 3_600_000).toISOString(), neighbourhoodIds: [], tier: 1 };

describe("AreaLive (Qodo PR #4)", () => {
  it("official outage vs neighbours reporting light: 0 neighbours agree with the shown status (#5)", () => {
    const community = aggregateAreaStatus("ajah", ["a", "b", "c"].map((w, i) => rep("on", i + 1, w, { areaId: "ajah" })), NOW);
    const s = resolveAreaStatus({ community, observations: [eko0], now: NOW });
    expect(s.mapState).toBe("CONFIRMED_OFF");
    render(<AreaLive areaId="ajah" initial={overview([s])} />);
    expect(screen.getByText("Neighbours agreeing with this").nextElementSibling).toHaveTextContent("0");
  });
  it("conflicting reports get a 'sources disagree' prompt, not 'no one reported' (#6)", () => {
    const community = aggregateAreaStatus("surulere", [rep("on", 1, "a", { areaId: "surulere" }), rep("off", 2, "b", { areaId: "surulere" })], NOW);
    render(<AreaLive areaId="surulere" initial={overview([resolveAreaStatus({ community, observations: [], now: NOW })])} />);
    expect(screen.getByRole("note")).toHaveTextContent(/Sources disagree right now.*Help confirm this area/);
    expect(screen.getByRole("note")).not.toHaveTextContent(/No one/);
  });
  it("prompt threshold comes from config, and both breakpoints get a working report link (#11, #12)", () => {
    const community = aggregateAreaStatus("yaba", [rep("off", 1, "a")], NOW);
    render(<AreaLive areaId="yaba" initial={overview([resolveAreaStatus({ community, observations: [], now: NOW })])} />);
    expect(screen.getByRole("note")).toHaveTextContent("1 of 3 needed neighbours say no light. Help confirm this area.");
    const hrefs = screen.getAllByRole("link", { name: /Report now/ }).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["#report", "#report-desktop"]);
  });
  it("evidence-only statuses show the evidence time, not 'None yet' (#8)", () => {
    const s = resolveAreaStatus({ community: aggregateAreaStatus("ajah", [], NOW), observations: [eko0], now: NOW });
    render(<AreaLive areaId="ajah" initial={overview([s])} />);
    expect(screen.getByText("Latest evidence").nextElementSibling).toHaveTextContent("5 min ago");
  });
  it("a lone verified report shows as Reported straight away, not 'no one reported' (pass 3, #3; sensors brief)", () => {
    const obs: Observation = { ...eko0, id: "v", sourceId: "verified:ada-yaba", externalId: "v1", scope: "neighbourhood", scopeRef: "yaba", kind: "status_report", status: "off", valueNum: null, url: null, tier: 2 };
    const s = resolveAreaStatus({ community: aggregateAreaStatus("yaba", [], NOW), observations: [obs], now: NOW });
    expect(s.mapState).toBe("COMMUNITY_OFF");
    render(<AreaLive areaId="yaba" initial={overview([s])} />);
    expect(screen.getAllByText("Reported: no light").length).toBeGreaterThan(0);
    expect(screen.queryByText(/No one has reported/)).toBeNull();
  });
});

describe("AreaLive — sensors brief", () => {
  const sensorStatus = () => {
    const sensor = { deviceId: "ldd_0000000000000099", areaId: "yaba", provider: "light_dey_v1", supplyPoint: "grid_direct" as const, mains: "off" as const, powerSource: "ups" as const, observedAt: new Date(NOW.getTime() - 60_000).toISOString(), health: "good" as const, healthReasons: [], networkHash: "n1" };
    const offline = { ...sensor, deviceId: "ldd_0000000000000098", networkHash: "n2", health: "offline" as const, observedAt: new Date(NOW.getTime() - 40 * 60_000).toISOString() };
    return resolveAreaStatus({ community: aggregateAreaStatus("yaba", [], NOW), observations: [], sensors: [sensor, offline], now: NOW });
  };
  it("a measured outage shows its 'Measured' evidence and sensor coverage", () => {
    render(<AreaLive areaId="yaba" initial={overview([sensorStatus()])} />);
    expect(screen.getAllByText("Confirmed outage").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Measured").length).toBeGreaterThan(0);
    expect(screen.getByText(/2 Light Dey sensors here: 1 online, 1 offline/)).toBeInTheDocument();
  });
  it("Reported/Likely states ask to help confirm; empty areas say 'Not enough current evidence'", () => {
    const one = resolveAreaStatus({ community: aggregateAreaStatus("yaba", [], NOW), observations: [{ ...eko0, id: "v", sourceId: "verified:x", externalId: "v", scope: "neighbourhood", scopeRef: "yaba", kind: "status_report", status: "off", tier: 2, sourceKind: "verified_reporter" }], now: NOW });
    const { unmount } = render(<AreaLive areaId="yaba" initial={overview([one])} />);
    expect(screen.getByRole("note")).toHaveTextContent(/Help confirm this area/);
    unmount();
    render(<AreaLive areaId="ikoyi" initial={overview([])} />);
    expect(screen.getAllByText("Not enough current evidence").length).toBeGreaterThan(0);
    expect(screen.getByRole("note")).toHaveTextContent(/Help confirm this area/);
  });
});
