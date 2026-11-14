import Link from "next/link";
import { MapPin, Users } from "lucide-react";
import { getArea } from "@/lib/areas";
import { STATUS_CONFIG } from "@/lib/config";
import { CONFIDENCE_LABEL, EVIDENCE_COUNT_NOUN, EVIDENCE_TYPE_LABEL, FRESHNESS_LABEL, timeAgo } from "@/lib/format";
import { latestEvidenceAt } from "@/lib/share";
import type { AreaStatus } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";

export function AreaStatusCard({ status, now }: { status: AreaStatus; now: number }) {
  const area = getArea(status.areaId);
  if (!area) return null;
  const decisive = status.evidence?.find((e) => e.role === "decisive" || e.role === "estimate");
  const unknown = status.mapState ? status.mapState === "UNKNOWN" : status.state === "UNKNOWN";
  return (
    <Link href={`/area/${area.id}`} className="group block rounded-2xl border border-line bg-surface p-4 transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-12px_rgba(15,17,21,0.25)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-display text-lg font-bold leading-tight group-hover:text-brand">{area.name}</h3>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-3">
            <MapPin className="h-3 w-3" aria-hidden /> {area.lga} LGA
          </p>
        </div>
        <StatusBadge state={status.state} mapState={status.mapState} />
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-ink-3">Reports (1h)</dt>
          <dd className="mt-0.5 font-semibold text-ink">{status.recentReports}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Neighbours (1h)</dt>
          <dd className="mt-0.5 flex items-center gap-1 font-semibold text-ink"><Users className="h-3 w-3" aria-hidden />{status.onReporters + status.offReporters}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Last update</dt>
          <dd className="mt-0.5 font-semibold text-ink">{timeAgo(latestEvidenceAt(status), now)}</dd>
        </div>
      </dl>
      <p className="mt-3 border-t border-line pt-3 text-xs text-ink-2">
        {decisive ? (
          <>
            <span className="font-semibold">{EVIDENCE_TYPE_LABEL[decisive.evidenceType]}</span> ·{" "}
            {decisive.evidenceType === "estimated" ? "not live" : decisive.sourceId === "community" || decisive.evidenceType === "measured" ? `${decisive.count} ${EVIDENCE_COUNT_NOUN[decisive.evidenceType]}` : decisive.sourceName} · {CONFIDENCE_LABEL[status.confidence]}
          </>
        ) : unknown && status.leaning ? (
          `${status.leaning === "on" ? status.onReporters : status.offReporters} of ${STATUS_CONFIG.confirmationThreshold} needed say ${status.leaning === "on" ? "light dey" : "no light"}`
        ) : unknown ? (
          "Not enough current evidence — help confirm"
        ) : (
          `${CONFIDENCE_LABEL[status.confidence]} · ${FRESHNESS_LABEL[status.freshness]}`
        )}
      </p>
    </Link>
  );
}
