"use client";
import { Clock, Info, MapPin, ShieldCheck, Users } from "lucide-react";
import { distanceKm, getArea, AREAS } from "@/lib/areas";
import { STATUS_CONFIG } from "@/lib/config";
import { CONFIDENCE_LABEL, FRESHNESS_LABEL, MAP_STATE_META, STATE_META, hourLabel, lagosTime, timeAgo } from "@/lib/format";
import { hasRecentReports, latestEvidenceAt } from "@/lib/share";
import { freshnessOf } from "@/lib/status";
import type { Overview } from "@/lib/types";
import { AreaStatusCard } from "./AreaStatusCard";
import { EvidenceList } from "./EvidenceList";
import { LagosMap } from "./LagosMap";
import { ShareButtons } from "./ShareButtons";
import { StatusBadge } from "./StatusBadge";
import { useOverview } from "./useOverview";

export function AreaLive({ areaId, initial, mobileReport }: { areaId: string; initial: Overview; mobileReport?: React.ReactNode }) {
  const data = useOverview(initial);
  const area = getArea(areaId)!;
  const s = data.statuses.find((x) => x.areaId === areaId)!;
  const now = Date.parse(data.generatedAt);
  const mapState = s.mapState ?? "UNKNOWN";
  const meta = MAP_STATE_META[mapState];
  const tone = STATE_META[meta.group];
  const hollow = meta.style === "hollow";
  const nearby = AREAS.filter((a) => a.id !== areaId)
    .map((a) => ({ a, km: distanceKm(area.lat, area.lng, a.lat, a.lng) }))
    .sort((x, y) => x.km - y.km)
    .slice(0, 3)
    .map(({ a }) => data.statuses.find((x) => x.areaId === a.id)!);
  const k = STATUS_CONFIG.confirmationThreshold;
  const verifiedSays = s.evidence?.find((e) => e.tier === 2 && e.role !== "context" && e.status)?.status ?? null;
  const ask =
    mapState === "CONFLICTING"
      ? `Sources disagree right now. Are you in ${area.name}? Tell us what you see.`
      : mapState === "UNKNOWN" || hollow
        ? !hasRecentReports(s)
          ? `No one has reported recently. Are you in ${area.name} now? One tap helps.`
          : s.leaning
            ? `${s.leaning === "on" ? s.onReporters : s.offReporters} of ${k} needed neighbours say ${s.leaning === "on" ? "light dey" : "no light"}. Can you confirm?`
            : verifiedSays
              ? `A verified reporter says ${verifiedSays === "on" ? "light dey" : "no light"}. Can you confirm?`
              : `Recent reports don't agree yet. Are you in ${area.name}? Tell us what you see.`
        : null;
  // Agreement is measured against the status shown, not whatever side the community leaned.
  const shownSide = meta.group === "LIGHT" ? "on" : meta.group === "NO_LIGHT" ? "off" : null;
  const agreeing = shownSide === "on" ? s.onReporters : shownSide === "off" ? s.offReporters : null;
  const latest = latestEvidenceAt(s);

  return (
    <>
      <div className={`rounded-3xl p-6 sm:p-8 ${hollow ? "border-2 border-dashed bg-surface" : tone.soft}`} style={hollow ? { borderColor: tone.hex } : undefined}>
        <StatusBadge state={s.state} mapState={mapState} size="lg" />
        <p className="mt-4 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{meta.label}</p>
        {s.explanation && <p className="mt-2 max-w-xl text-sm text-ink-2">{s.explanation}</p>}
        {s.estimate && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-bg px-3 py-2 text-sm text-ink-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Estimate for around {hourLabel(s.estimate.hour)}: {Math.round(s.estimate.probability * 100)}% of {s.estimate.samples} past confirmed hours had {s.estimate.status === "on" ? "light" : "no light"}. This is a pattern, not a live reading.
          </p>
        )}
        <dl className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="flex items-center gap-1 text-ink-3"><Users className="h-3.5 w-3.5" aria-hidden /> Neighbours agreeing with this</dt>
            <dd className="mt-1 font-semibold">{agreeing === null ? "—" : agreeing}</dd>
          </div>
          <div>
            <dt className="text-ink-3">Community reports (1h)</dt>
            <dd className="mt-1 font-semibold">{s.recentReports} · {s.onReporters} on / {s.offReporters} off</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-ink-3"><Clock className="h-3.5 w-3.5" aria-hidden /> Latest evidence</dt>
            <dd className="mt-1 font-semibold">{latest ? `${lagosTime(latest)} · ${timeAgo(latest, now)}` : "None yet"}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-ink-3"><ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Confidence</dt>
            <dd className="mt-1 font-semibold">{CONFIDENCE_LABEL[s.confidence]}{latest ? ` · ${FRESHNESS_LABEL[freshnessOf((now - Date.parse(latest)) / 60_000)]}` : ""}</dd>
          </div>
        </dl>
        {s.locationMatchedReports > 0 && (
          <p className="mt-4 flex items-center gap-1 text-xs text-ink-2"><MapPin className="h-3.5 w-3.5" aria-hidden /> {s.locationMatchedReports} of {s.recentReports} reports shared a location near this area.</p>
        )}
        <p className="mt-4 text-xs text-ink-3">A status describes the evidence we have, not every street in {area.name}.</p>
      </div>

      {ask && (
        <p className="mt-4 rounded-2xl border border-brand/30 bg-surface px-4 py-3 text-sm font-medium text-ink" role="note">
          {ask} <a href="#report" className="font-semibold text-brand underline-offset-2 hover:underline lg:hidden">Report now ↓</a>
          <a href="#report-desktop" className="hidden font-semibold text-brand underline-offset-2 hover:underline lg:inline">Report now →</a>
        </p>
      )}

      {mobileReport && <div className="mt-6 lg:hidden">{mobileReport}</div>}

      <section aria-labelledby="evidence-h" className="mt-8">
        <h2 id="evidence-h" className="font-display text-2xl font-bold">Where this comes from</h2>
        {s.evidence && s.evidence.length > 0 ? (
          <div className="mt-3">
            <EvidenceList items={s.evidence} now={now} />
          </div>
        ) : (
          <p className="mt-3 rounded-2xl border border-dashed border-line bg-surface px-4 py-4 text-sm text-ink-2">
            No live evidence for {area.name} right now: no official outage data covers it, and there are no community reports from the last hour. That&rsquo;s why it shows Unknown.
          </p>
        )}
        <p className="mt-2 text-xs text-ink-3">
          {s.disco ? `Officially served by ${s.disco === "eko" ? "Eko DisCo" : "Ikeja Electric"}, so DisCo-wide grid outages apply here.` : `${area.name} isn't officially mapped to a DisCo yet, so only national grid collapses and local reports apply.`}{" "}
          <a href="/sources" className="font-medium text-brand">How sources are used</a>
        </p>
      </section>

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
