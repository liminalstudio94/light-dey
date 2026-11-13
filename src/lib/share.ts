import { CONFIDENCE_LABEL, lagosTime } from "./format";
import type { AreaStatus } from "./types";

/** Share copy always carries time, confidence and source level, so it can't be mistaken for more than it is. */
export function shareText(areaName: string, s: AreaStatus, now = Date.now()): string {
  const mins = s.lastReportAt ? Math.max(1, Math.round((now - Date.parse(s.lastReportAt)) / 60_000)) : null;
  const when = s.lastReportAt ? ` Last report ${lagosTime(s.lastReportAt)} (${mins} min ago).` : "";
  const conf = ` ${CONFIDENCE_LABEL[s.confidence]}.`;
  const decisive = s.evidence?.find((e) => e.role === "decisive");
  const ms = s.mapState ?? (s.state === "LIGHT" ? "COMMUNITY_ON" : s.state === "NO_LIGHT" ? "COMMUNITY_OFF" : s.state === "UNCERTAIN" ? "CONFLICTING" : "UNKNOWN");
  switch (ms) {
    case "CONFIRMED_OFF":
      return `NO LIGHT in ${areaName} — confirmed by ${decisive?.sourceName ?? "an official source"}${decisive?.observedAt ? ` at ${lagosTime(decisive.observedAt)}` : ""}.${conf} Check Light Dey? before you go:`;
    case "CONFIRMED_ON":
      return `LIGHT DEY in ${areaName} — confirmed by ${decisive?.sourceName ?? "verified reporters"}${decisive?.observedAt ? ` at ${lagosTime(decisive.observedAt)}` : ""}.${conf} Check Light Dey? before you go:`;
    case "COMMUNITY_ON":
      return `LIGHT DEY! ${areaName} is currently reporting electricity. ${s.confirmingUsers} people confirmed in the last hour.${when}${conf} Check Light Dey? before you go:`;
    case "COMMUNITY_OFF":
      return `NO LIGHT in ${areaName} right now. ${s.confirmingUsers} people reported an outage in the last hour.${when}${conf} Check Light Dey? before you go:`;
    case "CONFLICTING":
      return `Light status in ${areaName} is mixed — ${s.onReporters} say light dey, ${s.offReporters} say no light.${when} Help confirm on Light Dey?:`;
    default:
      return `No live light reports for ${areaName}. Is there light where you are? Report it on Light Dey?:`;
  }
}
