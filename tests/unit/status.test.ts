import { describe, expect, it } from "vitest";
import { aggregateAreaStatus, freshnessOf } from "@/lib/status";
import { NOW, rep } from "./helpers";

const agg = (reports: Parameters<typeof aggregateAreaStatus>[1]) => aggregateAreaStatus("yaba", reports, NOW);

describe("aggregateAreaStatus", () => {
  it("no reports => UNKNOWN with no freshness", () => {
    const s = agg([]);
    expect(s.state).toBe("UNKNOWN");
    expect(s.freshness).toBe("none");
    expect(s.confidence).toBe("none");
  });

  it("a single report does not confirm an area", () => {
    const s = agg([rep("on", 2, "a")]);
    expect(s.state).toBe("UNKNOWN");
    expect(s.leaning).toBe("on");
    expect(s.confirmingUsers).toBe(0);
  });

  it("three distinct recent ON reports confirm LIGHT", () => {
    const s = agg([rep("on", 2, "a"), rep("on", 5, "b"), rep("on", 9, "c")]);
    expect(s.state).toBe("LIGHT");
    expect(s.confirmingUsers).toBe(3);
    expect(s.freshness).toBe("fresh");
  });

  it("three distinct recent OFF reports confirm NO_LIGHT", () => {
    const s = agg([rep("off", 1, "a"), rep("off", 3, "b"), rep("off", 4, "c")]);
    expect(s.state).toBe("NO_LIGHT");
  });

  it("the same user reporting three times counts once", () => {
    const s = agg([rep("on", 1, "a"), rep("on", 12, "a"), rep("on", 25, "a")]);
    expect(s.state).toBe("UNKNOWN");
    expect(s.onReporters).toBe(1);
  });

  it("conflicting reports below threshold => UNCERTAIN", () => {
    const s = agg([rep("on", 2, "a"), rep("on", 3, "b"), rep("off", 4, "c")]);
    expect(s.state).toBe("UNCERTAIN");
    expect(s.leaning).toBe("on");
  });

  it("when both sides are confirmed, the more recent confirmation wins (power changed)", () => {
    const s = agg([rep("off", 50, "a"), rep("off", 45, "b"), rep("off", 40, "c"), rep("on", 6, "d"), rep("on", 4, "e"), rep("on", 2, "f")]);
    expect(s.state).toBe("LIGHT");
  });

  it("a reporter who changes their mind only counts for their latest report", () => {
    const s = agg([rep("on", 30, "a"), rep("off", 2, "a"), rep("off", 3, "b"), rep("off", 4, "c")]);
    expect(s.state).toBe("NO_LIGHT");
    expect(s.onReporters).toBe(0);
  });

  it("stale reports do not display as live", () => {
    const s = agg([rep("on", 61, "a"), rep("on", 70, "b"), rep("on", 90, "c")]);
    expect(s.state).toBe("UNKNOWN");
    expect(s.freshness).toBe("stale");
    expect(s.recentReports).toBe(0);
  });

  it("caps how many reporters from one network can count", () => {
    const s = agg([rep("on", 1, "a", { net: "x" }), rep("on", 2, "b", { net: "x" }), rep("on", 3, "c", { net: "x" })]);
    expect(s.onReporters).toBe(2);
    expect(s.state).toBe("UNKNOWN");
  });

  it("ignores removed and flagged reports", () => {
    const s = agg([rep("on", 1, "a"), rep("on", 2, "b", { verification: "removed" }), rep("on", 3, "c", { verification: "flagged" })]);
    expect(s.state).toBe("UNKNOWN");
  });

  it("ignores other areas' reports", () => {
    const s = agg([rep("on", 1, "a", { areaId: "ikeja" }), rep("on", 2, "b", { areaId: "ikeja" }), rep("on", 3, "c", { areaId: "ikeja" })]);
    expect(s.state).toBe("UNKNOWN");
  });

  it("high confidence needs many fresh, agreeing reporters", () => {
    const five = ["a", "b", "c", "d", "e"].map((id, i) => rep("on", i + 1, id));
    expect(agg(five).confidence).toBe("high");
    expect(agg(five.slice(0, 3)).confidence).toBe("medium");
  });

  it("confirmed but ageing reports drop to low confidence", () => {
    const s = agg([rep("on", 40, "a"), rep("on", 45, "b"), rep("on", 50, "c")]);
    expect(s.state).toBe("LIGHT");
    expect(s.confidence).toBe("low");
    expect(s.freshness).toBe("ageing");
  });
});

describe("freshnessOf", () => {
  it.each([
    [0, "fresh"],
    [15, "fresh"],
    [16, "recent"],
    [30, "recent"],
    [31, "ageing"],
    [60, "ageing"],
    [61, "stale"],
  ] as const)("%i minutes => %s", (m, f) => expect(freshnessOf(m)).toBe(f));
});
