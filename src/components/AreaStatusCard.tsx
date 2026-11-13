import Link from "next/link";
import { MapPin, Users } from "lucide-react";
import { getArea } from "@/lib/areas";
import { CONFIDENCE_LABEL, FRESHNESS_LABEL, timeAgo } from "@/lib/format";
import type { AreaStatus } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";

export function AreaStatusCard({ status, now }: { status: AreaStatus; now: number }) {
  const area = getArea(status.areaId);
  if (!area) return null;
  const unconfirmed = status.state === "UNKNOWN" && status.leaning;
  return (
    <Link href={`/area/${area.id}`} className="group block rounded-2xl border border-line bg-surface p-4 transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-12px_rgba(15,17,21,0.25)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-display text-lg font-bold leading-tight group-hover:text-brand">{area.name}</h3>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-3">
            <MapPin className="h-3 w-3" aria-hidden /> {area.lga} LGA
          </p>
        </div>
        <StatusBadge state={status.state} />
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-ink-3">Reports (1h)</dt>
          <dd className="mt-0.5 font-semibold text-ink">{status.recentReports}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Confirming</dt>
          <dd className="mt-0.5 flex items-center gap-1 font-semibold text-ink"><Users className="h-3 w-3" aria-hidden />{status.confirmingUsers}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Last report</dt>
          <dd className="mt-0.5 font-semibold text-ink">{timeAgo(status.lastReportAt, now)}</dd>
        </div>
      </dl>
      <p className="mt-3 border-t border-line pt-3 text-xs text-ink-2">
        {unconfirmed
          ? `1–2 people say ${status.leaning === "on" ? "light dey" : "no light"} · needs 3 to confirm`
          : `${CONFIDENCE_LABEL[status.confidence]} · ${FRESHNESS_LABEL[status.freshness]}`}
      </p>
    </Link>
  );
}
