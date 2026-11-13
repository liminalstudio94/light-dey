import { describe, expect, it } from "vitest";
import { historyStats, hourlySamples } from "@/lib/history";
import { NOW, rep } from "./helpers";

describe("history", () => {
  it("is all UNKNOWN with no data, and never invents availability", () => {
    const h = historyStats("yaba", [], 7, NOW);
    expect(h.samples).toHaveLength(7 * 24);
    expect(h.samples.every((s) => s.state === "UNKNOWN")).toBe(true);
    expect(h.availabilityPct).toBeNull();
    expect(h.reliabilityScore).toBeNull();
    expect(h.coveragePct).toBe(0);
    expect(h.bestHours).toEqual([]);
  });

  it("derives a light period then an outage from real reports", () => {
    const reports = [
      // ON confirmed 07:10, expires 08:05 when the first report leaves the window
      rep("on", 295, "a"), rep("on", 292, "b"), rep("on", 290, "c"),
      // OFF confirmed 10:05, expires 11:02
      rep("off", 118, "d"), rep("off", 117, "e"), rep("off", 115, "f"),
    ];
    const samples = hourlySamples("yaba", reports, 1, NOW);
    const states = samples.slice(-6).map((s) => s.state);
    // Hours 06-07 .. 11-12. A state only shows while its reports are inside the 60-minute window.
    expect(states).toEqual(["UNKNOWN", "LIGHT", "UNKNOWN", "UNKNOWN", "NO_LIGHT", "UNKNOWN"]);
    const h = historyStats("yaba", reports, 1, NOW);
    expect(h.outages).toBe(1);
    expect(h.lightPeriods).toBe(1);
    expect(h.availabilityPct).toBe(50);
  });
});
