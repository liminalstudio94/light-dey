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
  it("an official outage never quotes neighbours who reported light (Qodo pass 3, #2-1)", () => {
    const s = aggregateAreaStatus("ajah", ["a", "b", "c"].map((w, i) => rep("on", i + 1, w, { areaId: "ajah" })), NOW);
    const official = { ...s, state: "NO_LIGHT" as const, mapState: "CONFIRMED_OFF" as const, evidence: [{ sourceId: "niso_niggrid", sourceName: "NISO grid data", tier: 1 as const, evidenceType: "official" as const, role: "decisive" as const, status: "off" as const, summary: "", count: 1, observedAt: NOW.toISOString(), freshness: "fresh" as const, url: null }] };
    const t = shareText("Ajah", official, NOW.getTime());
    expect(t).toMatch(/NISO grid data/);
    expect(t).not.toMatch(/3 people|3 neighbours/);
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
    // Estimates only exist when there are no fresh reports (engine rule), so use an area with none.
    expect(shareText("Yaba", { ...aggregateAreaStatus("yaba", [], NOW), mapState: "ESTIMATED_OFF" }, NOW.getTime())).toMatch(/^No live light reports/);
    const official = { ...base, mapState: "CONFIRMED_OFF" as const, evidence: [{ sourceId: "niso_niggrid", sourceName: "NISO grid data", tier: 1 as const, evidenceType: "official" as const, role: "decisive" as const, status: "off" as const, summary: "", count: 1, observedAt: NOW.toISOString(), freshness: "fresh" as const, url: null }] };
    expect(shareText("Yaba", official, NOW.getTime())).toMatch(/^GRID SUPPLY OUTAGE affecting Yaba — official NISO grid data at/);
    expect(shareText("Yaba", official, NOW.getTime())).toMatch(/generator, solar or a private supply/); // Qodo #4-10
    const verifiedConfirmed = { ...official, evidence: [{ ...official.evidence[0], sourceId: "verified_reporters", sourceName: "Verified reporter", tier: 2 as const }] };
    expect(shareText("Yaba", verifiedConfirmed, NOW.getTime())).toMatch(/^NO LIGHT in Yaba — confirmed by Verified reporter at/);
  });
});

const ev = (p: Partial<EvidenceItem>): EvidenceItem => ({ sourceId: "ikeja_electric_notices", sourceName: "Ikeja Electric notices", tier: 1, evidenceType: "official", role: "context", status: null, summary: "Notice", count: 1, observedAt: NOW.toISOString(), freshness: "fresh", url: null, ...p });

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

describe("Qodo re-review on PR #4", () => {
  it("a flagged report never supplies the 'latest evidence' time (#1)", async () => {
    const { latestEvidenceAt } = await import("@/lib/share");
    const s = aggregateAreaStatus("yaba", [rep("off", 2, "a", { verification: "flagged" })], NOW);
    expect(s.lastReportAt).toBeNull();
    expect(s.freshness).toBe("none");
    expect(latestEvidenceAt(s)).toBeNull();
    // A valid report that has merely aged out still counts as history.
    expect(aggregateAreaStatus("yaba", [rep("off", 90, "a")], NOW).lastReportAt).not.toBeNull();
  });
});

describe("Qodo pass 3 on PR #4", () => {
  it("Unknown shares never deny reports that exist (#1)", () => {
    const one = aggregateAreaStatus("yaba", [rep("off", 2, "a")], NOW);
    expect(shareText("Yaba", { ...one, mapState: "UNKNOWN" }, NOW.getTime())).toMatch(/some recent reports, but not enough to confirm yet/);
    const verifiedOnly = { ...aggregateAreaStatus("yaba", [], NOW), mapState: "UNKNOWN" as const, evidence: [ev({ sourceId: "verified_reporters", sourceName: "Verified reporter", tier: 2, role: "supporting", status: "off" })] };
    expect(shareText("Yaba", verifiedOnly, NOW.getTime())).toMatch(/not enough to confirm yet/);
    expect(shareText("Yaba", { ...aggregateAreaStatus("yaba", [], NOW), mapState: "UNKNOWN" }, NOW.getTime())).toMatch(/^No live light reports/);
  });
  it("map search shows evidence-based states, e.g. estimates aren't called Unknown (#2)", async () => {
    const { AreaSearch } = await import("@/components/AreaSearch");
    render(<AreaSearch states={{ agege: "UNKNOWN", ajah: "NO_LIGHT" }} mapStates={{ agege: "ESTIMATED_ON", ajah: "CONFIRMED_OFF" }} />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "ag" } });
    expect(screen.getByRole("option", { name: /Agege/ })).toHaveTextContent("Est. on");
    fireEvent.change(input, { target: { value: "aja" } });
    expect(screen.getByRole("option", { name: /Ajah/ })).toHaveTextContent("Confirmed off");
  });
});

describe("Qodo pass 4 on PR #2 — share text", () => {
  it("official/verified conflicts never quote '0 vs 0' neighbours (#2)", () => {
    const empty = { ...aggregateAreaStatus("ajah", [], NOW), mapState: "CONFLICTING" as const, state: "UNCERTAIN" as const };
    expect(shareText("Ajah", empty, NOW.getTime())).toMatch(/^Sources disagree about light in Ajah right now/);
    const mixed = { ...aggregateAreaStatus("ajah", [rep("on", 1, "a", { areaId: "ajah" }), rep("off", 2, "b", { areaId: "ajah" })], NOW), mapState: "CONFLICTING" as const };
    expect(shareText("Ajah", mixed, NOW.getTime())).toMatch(/1 say light dey, 1 say no light/);
  });
});
