import { CONFIDENCE_LABEL, lagosTime } from "./format";
import type { AreaStatus } from "./types";

/** Share copy always carries the time and confidence so it can't be mistaken for official data. */
export function shareText(areaName: string, s: AreaStatus, now = Date.now()): string {
  const mins = s.lastReportAt ? Math.max(1, Math.round((now - Date.parse(s.lastReportAt)) / 60_000)) : null;
  const when = s.lastReportAt ? ` Last report ${lagosTime(s.lastReportAt)} (${mins} min ago).` : "";
  const conf = ` ${CONFIDENCE_LABEL[s.confidence]}.`;
  // Confirmed (official/verified) statuses never quote neighbour counts: neighbours may have said the opposite.
  const decisive = s.evidence?.find((e) => e.role === "decisive");
  if (s.mapState === "CONFIRMED_OFF" || s.mapState === "CONFIRMED_ON") {
    const what = s.mapState === "CONFIRMED_OFF" ? `NO LIGHT in ${areaName}` : `LIGHT DEY in ${areaName}`;
    return `${what} — confirmed by ${decisive?.sourceName ?? "verified sources"}.${conf} Check Light Dey? before you go:`;
  }
  if (s.mapState === "ESTIMATED_ON" || s.mapState === "ESTIMATED_OFF") {
    return `No live light reports for ${areaName}. Is there light where you are? Report it on Light Dey?:`;
  }
  switch (s.state) {
    case "LIGHT":
      return `LIGHT DEY! ${areaName} is currently reporting electricity. ${s.confirmingUsers} people confirmed in the last hour.${when}${conf} Check Light Dey? before you go:`;
    case "NO_LIGHT":
      return `NO LIGHT in ${areaName} right now. ${s.confirmingUsers} people reported an outage in the last hour.${when}${conf} Check Light Dey? before you go:`;
    case "UNCERTAIN":
      return `Light status in ${areaName} is mixed — ${s.onReporters} say light dey, ${s.offReporters} say no light.${when} Help confirm on Light Dey?:`;
    default:
      return `No recent light reports for ${areaName}. Is there light where you are? Report it on Light Dey?:`;
  }
}
