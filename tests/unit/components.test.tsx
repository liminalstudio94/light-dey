// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AreaStatusCard } from "@/components/AreaStatusCard";
import { StatusBadge } from "@/components/StatusBadge";
import { shareText } from "@/lib/share";
import { aggregateAreaStatus } from "@/lib/status";
import { NOW, rep } from "./helpers";

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
    expect(screen.getByText(/needs 3 to confirm/)).toBeInTheDocument();
  });
});

describe("shareText", () => {
  it("includes time and confidence", () => {
    const s = aggregateAreaStatus("yaba", [rep("on", 1, "a"), rep("on", 2, "b"), rep("on", 3, "c")], NOW);
    const t = shareText("Yaba", s, NOW.getTime());
    expect(t).toMatch(/^LIGHT DEY! Yaba/);
    expect(t).toMatch(/Last report \d{1,2}:\d{2}/);
    expect(t).toMatch(/Medium confidence/);
  });
  it("never claims light for an unknown area", () => {
    const t = shareText("Yaba", aggregateAreaStatus("yaba", [], NOW), NOW.getTime());
    expect(t).not.toMatch(/LIGHT DEY!/);
  });
});
