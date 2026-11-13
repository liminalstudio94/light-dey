"use client";
import { Clock, MapPin, ShieldCheck, Users } from "lucide-react";
import { distanceKm, getArea, AREAS } from "@/lib/areas";
import { CONFIDENCE_LABEL, FRESHNESS_LABEL, STATE_META, lagosTime, timeAgo } from "@/lib/format";
import type { Overview } from "@/lib/types";
import { AreaStatusCard } from "./AreaStatusCard";
import { LagosMap } from "./LagosMap";
import { ShareButtons } from "./ShareButtons";
import { StatusBadge } from "./StatusBadge";
import { useOverview } from "./useOverview";

const EXPLAIN = {
  LIGHT: "At least 3 different neighbours reported electricity in the last hour.",
  NO_LIGHT: "At least 3 different neighbours reported an outage in the last hour.",
  UNCERTAIN: "Reports in the last hour disagree and neither side has 3 confirmations yet.",
  UNKNOWN: "Not enough recent reports to say. Reports older than an hour don't count as live.",
} as const;

export function AreaLive({ areaId, initial, mobileReport }: { areaId: string; initial: Overview; mobileReport?: React.ReactNode }) {
  const data = useOverview(initial);
  const area = getArea(areaId)!;
  const s = data.statuses.find((x) => x.areaId === areaId)!;
  const now = Date.parse(data.generatedAt);
  const m = STATE_META[s.state];
  const nearby = AREAS.filter((a) => a.id !== areaId)
    .map((a) => ({ a, km: distanceKm(area.lat, area.lng, a.lat, a.lng) }))
    .sort((x, y) => x.km - y.km)
    .slice(0, 3)
    .map(({ a }) => data.statuses.find((x) => x.areaId === a.id)!);

  return (
    <>
      <div className={`rounded-3xl p-6 sm:p-8 ${m.soft}`}>
        <StatusBadge state={s.state} size="lg" />
        <p className="mt-4 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{m.label}{s.state === "LIGHT" ? "!" : ""}</p>
        <p className="mt-2 max-w-xl text-sm text-ink-2">{EXPLAIN[s.state]}</p>
        {s.state === "UNKNOWN" && s.leaning && (
          <p className="mt-2 text-sm font-medium text-ink">{s.leaning === "on" ? s.onReporters : s.offReporters} of 3 needed people say {s.leaning === "on" ? "light dey" : "no light"}.</p>
        )}
        <dl className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="flex items-center gap-1 text-ink-3"><Users className="h-3.5 w-3.5" aria-hidden /> Confirming</dt>
            <dd className="mt-1 font-semibold">{s.confirmingUsers} people</dd>
          </div>
          <div>
            <dt className="text-ink-3">Reports (1h)</dt>
            <dd className="mt-1 font-semibold">{s.recentReports} · {s.onReporters} on / {s.offReporters} off</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-ink-3"><Clock className="h-3.5 w-3.5" aria-hidden /> Last report</dt>
            <dd className="mt-1 font-semibold">{s.lastReportAt ? `${lagosTime(s.lastReportAt)} · ${timeAgo(s.lastReportAt, now)}` : "None yet"}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-ink-3"><ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Confidence</dt>
            <dd className="mt-1 font-semibold">{CONFIDENCE_LABEL[s.confidence]} · {FRESHNESS_LABEL[s.freshness]}</dd>
          </div>
        </dl>
        {s.locationMatchedReports > 0 && (
          <p className="mt-4 flex items-center gap-1 text-xs text-ink-2"><MapPin className="h-3.5 w-3.5" aria-hidden /> {s.locationMatchedReports} of {s.recentReports} reports shared a location near this area.</p>
        )}
        <p className="mt-4 text-xs text-ink-3">A report means light (or no light) where that person is — not necessarily every street in {area.name}.</p>
      </div>

      {mobileReport && <div className="mt-6 lg:hidden">{mobileReport}</div>}

      <div className="mt-6 rounded-3xl border border-line bg-surface p-5">
        <ShareButtons areaName={area.name} path={`/area/${area.id}`} status={s} />
      </div>

      <section aria-labelledby="nearby-h" className="mt-10">
        <h2 id="nearby-h" className="font-display text-2xl font-bold">Compare nearby</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {nearby.map((n) => (
            <AreaStatusCard key={n.areaId} status={n} now={now} />
          ))}
        </div>
        <div className="mt-4">
          <LagosMap statuses={[s, ...nearby]} now={now} height={300} focusId={areaId} />
        </div>
      </section>
    </>
  );
}
