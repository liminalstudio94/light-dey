// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AreaStatusCard } from "@/components/AreaStatusCard";
import { EvidenceList } from "@/components/EvidenceList";
import { LiveExplorer } from "@/components/LiveExplorer";
import { StatusBadge } from "@/components/StatusBadge";
import { formatMw } from "@/lib/format";
import { noticeObservations } from "@/lib/ingest/ikejaNotices";
import type { AreaStatus, EvidenceItem } from "@/lib/types";
import { shareText } from "@/lib/share";
import { aggregateAreaStatus } from "@/lib/status";
import { NOW, rep } from "./helpers";

vi.mock("@/components/LagosMap", () => ({ LagosMap: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

describe("StatusBadge", () => {
  it.each([
    ["LIGHT", "Light dey"],
    ["NO_LIGHT", "No light"],
    ["UNCERTAIN", "Uncertain"],
    ["UNKNOWN", "Unknown"],
  ] as const)("%s renders %s", (state, label) => {
    render(<StatusBadge state={state} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe("AreaStatusCard", () => {
  it("shows name, counts and confidence for a confirmed area", () => {
    const s = aggregateAreaStatus("ikeja", [rep("on", 1, "a", { areaId: "ikeja" }), rep("on", 2, "b", { areaId: "ikeja" }), rep("on", 3, "c", { areaId: "ikeja" })], NOW);
    render(<AreaStatusCard status={s} now={NOW.getTime()} />);
    expect(screen.getByRole("heading", { name: "Ikeja" })).toBeInTheDocument();
    expect(screen.getByText("Light dey")).toBeInTheDocument();
    expect(screen.getByText(/Medium confidence/)).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/area/ikeja");
  });
  it("explains an unconfirmed single report instead of showing it as live", () => {
    const s = aggregateAreaStatus("ikeja", [rep("off", 1, "a", { areaId: "ikeja" })], NOW);
    render(<AreaStatusCard status={s} now={NOW.getTime()} />);
    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.getByText(/1 of 3 needed say no light/)).toBeInTheDocument();
  });
});

describe("shareText", () => {
  it("includes time and confidence, and community light is 'reported', never 'confirmed' (Qodo #4-7)", () => {
    const s = aggregateAreaStatus("yaba", [rep("on", 1, "a"), rep("on", 2, "b"), rep("on", 3, "c")], NOW);
    const t = shareText("Yaba", s, NOW.getTime());
    expect(t).toMatch(/^LIGHT DEY reported in Yaba/);
    expect(t).not.toMatch(/confirm/i);
    expect(t).toMatch(/Last report \d{1,2}:\d{2}/);
    expect(t).toMatch(/Medium confidence/);
  });
  it("never claims light for an unknown area", () => {
    const t = shareText("Yaba", aggregateAreaStatus("yaba", [], NOW), NOW.getTime());
    expect(t).not.toMatch(/LIGHT DEY!/);
  });
});

describe("evidence-aware UI", () => {
  it("map-state badge labels say how sure we are", () => {
    render(<StatusBadge state="NO_LIGHT" mapState="CONFIRMED_OFF" />);
    expect(screen.getByText("Confirmed outage")).toBeInTheDocument();
    render(<StatusBadge state="UNKNOWN" mapState="ESTIMATED_ON" />);
    expect(screen.getByText("Estimate: usually light")).toBeInTheDocument();
  });
  it("share text never upgrades a reported status to confirmed, or an estimate to live", () => {
    const base = aggregateAreaStatus("yaba", [rep("off", 1, "a"), rep("off", 2, "b"), rep("off", 3, "c")], NOW);
    expect(shareText("Yaba", { ...base, mapState: "COMMUNITY_OFF" }, NOW.getTime())).toMatch(/^NO LIGHT reported in Yaba: 3 neighbours reported an outage .*\(not official\)/);
    expect(shareText("Yaba", { ...base, mapState: "ESTIMATED_OFF" }, NOW.getTime())).toMatch(/^No live light reports/);
    const official = { ...base, mapState: "CONFIRMED_OFF" as const, evidence: [{ sourceId: "niso_niggrid", sourceName: "NISO grid data", tier: 1 as const, role: "decisive" as const, status: "off" as const, summary: "", count: 1, observedAt: NOW.toISOString(), freshness: "fresh" as const, url: null }] };
    expect(shareText("Yaba", official, NOW.getTime())).toMatch(/^GRID SUPPLY OUTAGE affecting Yaba — official NISO grid data at/);
    expect(shareText("Yaba", official, NOW.getTime())).toMatch(/generator, solar or a private supply/); // Qodo #4-10
    const verifiedConfirmed = { ...official, evidence: [{ ...official.evidence[0], sourceId: "verified_reporters", sourceName: "Verified reporter", tier: 2 as const }] };
    expect(shareText("Yaba", verifiedConfirmed, NOW.getTime())).toMatch(/^NO LIGHT in Yaba — confirmed by Verified reporter at/);
  });
});

const ev = (p: Partial<EvidenceItem>): EvidenceItem => ({ sourceId: "ikeja_electric_notices", sourceName: "Ikeja Electric notices", tier: 1, role: "context", status: null, summary: "Notice", count: 1, observedAt: NOW.toISOString(), freshness: "fresh", url: null, ...p });

describe("Qodo PR #4 fixes", () => {
  it("only links attribution to trusted https source hosts (#1)", () => {
    render(<EvidenceList now={NOW.getTime()} items={[ev({ url: "https://www.ikejaelectric.com/notice" }), ev({ url: "https://evil.example/fake" }), ev({ url: "javascript:alert(1)" }), ev({ url: "http://www.ikejaelectric.com/x" })]} />);
    const links = screen.queryAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "https://www.ikejaelectric.com/notice");
  });
  it("drops RSS notices whose link leaves the DisCo's own site (#1)", () => {
    const item = { guid: "g", title: "Shomolu maintenance", text: "Work in Shomolu", publishedAt: NOW.toISOString() };
    expect(noticeObservations([{ ...item, link: "https://www.ikejaelectric.com/a" }], NOW)).toHaveLength(1);
    expect(noticeObservations([{ ...item, link: "https://phish.example/ikeja" }], NOW)).toHaveLength(0);
  });
  it("formats MW identically regardless of the browser locale (#3)", () => {
    expect(formatMw(3216.4)).toBe("3,216");
  });
  it("never lets the user filter the map down to nothing (#13)", () => {
    const st = (areaId: string): AreaStatus => ({ ...aggregateAreaStatus(areaId, [], NOW), mapState: "COMMUNITY_OFF", state: "NO_LIGHT" });
    render(<LiveExplorer statuses={[st("yaba"), st("ikeja")]} now={NOW.getTime()} defaultView="list" />);
    const chip = screen.getByRole("button", { name: /Reported: no light/ });
    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });
});
