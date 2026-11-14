import { CONFIDENCE_LABEL, lagosTime } from "./format";
import type { AreaStatus } from "./types";

/** Newest time behind the shown status: a community report or a live (non-context) evidence item. */
export function latestEvidenceAt(s: AreaStatus): string | null {
  const times = [s.lastReportAt, ...(s.evidence ?? []).filter((e) => e.role !== "context" && e.role !== "estimate").map((e) => e.observedAt)].filter((t): t is string => !!t);
  return times.length ? times.reduce((a, b) => (Date.parse(a) > Date.parse(b) ? a : b)) : null;
}

/** Fresh reports exist (community or verified) even if they don't establish a status yet. */
export function hasRecentReports(s: AreaStatus): boolean {
  return s.recentReports > 0 || (s.evidence ?? []).some((e) => e.role !== "context" && e.role !== "estimate");
}

/**
 * Share copy always carries time, confidence and source level, and never says more than the
 * evidence: community => "reported", grid data => "grid supply", estimates/unknown => no claim.
 */
export function shareText(areaName: string, s: AreaStatus, now = Date.now()): string {
  const mins = s.lastReportAt ? Math.max(1, Math.round((now - Date.parse(s.lastReportAt)) / 60_000)) : null;
  const when = s.lastReportAt ? ` Last report ${lagosTime(s.lastReportAt)} (${mins} min ago).` : "";
  const conf = ` ${CONFIDENCE_LABEL[s.confidence]}.`;
  const decisive = s.evidence?.find((e) => e.role === "decisive");
  const at = decisive?.observedAt ? ` at ${lagosTime(decisive.observedAt)}` : "";
  const ms = s.mapState ?? (s.state === "LIGHT" ? "COMMUNITY_ON" : s.state === "NO_LIGHT" ? "COMMUNITY_OFF" : s.state === "UNCERTAIN" ? "CONFLICTING" : "UNKNOWN");
  switch (ms) {
    case "CONFIRMED_OFF":
      if (decisive?.sourceId === "niso_niggrid")
        return `GRID SUPPLY OUTAGE affecting ${areaName} — official NISO grid data${at}. Homes on generator, solar or a private supply may still have power.${conf} Check Light Dey? before you go:`;
      return `NO LIGHT in ${areaName} — confirmed by ${decisive?.sourceName ?? "verified sources"}${at}.${conf} Check Light Dey? before you go:`;
    case "CONFIRMED_ON":
      return `LIGHT DEY in ${areaName} — confirmed by ${decisive?.sourceName ?? "verified sources"}${at}.${conf} Check Light Dey? before you go:`;
    case "COMMUNITY_ON":
      return `LIGHT DEY reported in ${areaName}: ${s.confirmingUsers} neighbours reported electricity in the last hour (not official).${when}${conf} Check Light Dey? before you go:`;
    case "COMMUNITY_OFF":
      return `NO LIGHT reported in ${areaName}: ${s.confirmingUsers} neighbours reported an outage in the last hour (not official).${when}${conf} Check Light Dey? before you go:`;
    case "CONFLICTING":
      return `Light status in ${areaName} is mixed — reports disagree right now.${when} Help confirm on Light Dey?:`;
    default:
      // Unknown or estimate: never deny reports that exist; say they're not enough yet.
      return hasRecentReports(s)
        ? `Light status in ${areaName}: some recent reports, but not enough to confirm yet. Is there light where you are? Help confirm on Light Dey?:`
        : `No live light reports for ${areaName}. Is there light where you are? Report it on Light Dey?:`;
  }
}
