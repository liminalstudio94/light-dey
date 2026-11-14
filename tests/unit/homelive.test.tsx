// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HomeLive } from "@/components/HomeLive";
import { AREAS } from "@/lib/areas";
import { resolveAreaStatus } from "@/lib/evidence";
import { aggregateAreaStatus } from "@/lib/status";
import type { MapState, Overview } from "@/lib/types";
import { NOW, rep } from "./helpers";

vi.mock("@/components/LagosMap", () => ({ LagosMap: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

function overview(grid: Overview["grid"]): Overview {
  const statuses = AREAS.map((a) => {
    const reports = a.id === "surulere" ? [rep("on", 1, "x", { areaId: "surulere" }), rep("off", 2, "y", { areaId: "surulere" })] : [];
    return resolveAreaStatus({ community: aggregateAreaStatus(a.id, reports, NOW), observations: [], now: NOW });
  });
  const mapCounts = {} as Record<MapState, number>;
  for (const s of statuses) mapCounts[s.mapState!] = (mapCounts[s.mapState!] ?? 0) + 1;
  return { statuses, counts: { LIGHT: 0, NO_LIGHT: 0, UNCERTAIN: 1, UNKNOWN: 40 }, mapCounts, recent: [], reportsLast24h: 2, reportersLast24h: 2, areasReportedLast24h: 1, generatedAt: NOW.toISOString(), storeKind: "supabase", grid };
}

describe("HomeLive (Qodo re-review on PR #4)", () => {
  it("counts conflicting areas as having live evidence (#2)", () => {
    render(<HomeLive initial={overview(null)} />);
    expect(screen.getByText(/1 of 41 areas have current evidence/)).toBeInTheDocument();
  });
  it("labels each grid figure with its own time when they differ (#3)", () => {
    const t = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();
    render(<HomeLive initial={overview({ asOf: t(5), totalMw: 3216, totalAsOf: t(5), discos: [{ id: "eko", name: "Eko DisCo (EKEDP)", mw: 482, asOf: t(50) }, { id: "ikeja", name: "Ikeja Electric", mw: 493, asOf: t(5) }], sourceUrl: "https://www.niggrid.org/DisCoLoadProfile", collapse: false })} />);
    expect(screen.getByText(/Eko DisCo \(EKEDP\): 482 MW \(as at \d{1,2}:\d{2}/)).toBeInTheDocument();
    expect(screen.getByText(/Ikeja Electric: 493 MW(?! \(as at)/)).toBeInTheDocument();
  });
});
