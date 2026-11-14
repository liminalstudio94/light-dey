"use client";
import Link from "next/link";
import { Activity, ArrowRight, ExternalLink, MapPin, Zap } from "lucide-react";
import { AREAS, getArea } from "@/lib/areas";
import { STATE_META, formatMw, lagosTime, timeAgo } from "@/lib/format";
import type { AreaState, GridContext, MapState, Overview } from "@/lib/types";
import { AreaSearch } from "./AreaSearch";
import { AreaStatusCard } from "./AreaStatusCard";
import { LiveExplorer } from "./LiveExplorer";
import { StatusDot } from "./StatusBadge";
import { useOverview } from "./useOverview";


export function HeroSearch({ initial }: { initial: Overview }) {
  const data = useOverview(initial);
  const states = Object.fromEntries(data.statuses.map((s) => [s.areaId, s.state]));
  return <AreaSearch states={states} autoFocus={false} />;
}

/** Every live section of the home page shares one polled overview. */
export function HomeLive({ initial }: { initial: Overview }) {
  const data = useOverview(initial);
  const now = Date.parse(data.generatedAt);
  const popular = AREAS.filter((a) => a.popular).map((a) => data.statuses.find((s) => s.areaId === a.id)!).filter(Boolean);
  const mc = data.mapCounts ?? ({} as Record<MapState, number>);
  const n = (m: MapState) => mc[m] ?? 0;
  const confirmed = n("CONFIRMED_ON") + n("CONFIRMED_OFF") + n("COMMUNITY_ON") + n("COMMUNITY_OFF");
  const tiles: { state: AreaState; label: string; total: number; detail: string }[] = [
    { state: "LIGHT", label: "Light dey", total: n("CONFIRMED_ON") + n("COMMUNITY_ON"), detail: `${n("CONFIRMED_ON")} confirmed · ${n("COMMUNITY_ON")} reported` },
    { state: "NO_LIGHT", label: "No light", total: n("CONFIRMED_OFF") + n("COMMUNITY_OFF"), detail: `${n("CONFIRMED_OFF")} confirmed · ${n("COMMUNITY_OFF")} reported` },
    { state: "UNCERTAIN", label: "Conflicting", total: n("CONFLICTING"), detail: "sources disagree" },
    { state: "UNKNOWN", label: "Unknown", total: n("UNKNOWN"), detail: n("ESTIMATED_ON") + n("ESTIMATED_OFF") ? `+ ${n("ESTIMATED_ON") + n("ESTIMATED_OFF")} more with only a historical estimate` : "not enough verified data" },
  ];

  return (
    <>
      {/* Overview */}
      <section aria-labelledby="overview-h" className="mx-auto max-w-6xl px-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-3">
              <span className="relative inline-block h-2 w-2 rounded-full bg-on text-on live-dot" aria-hidden /> Live · updated {lagosTime(data.generatedAt)}
            </p>
            <h2 id="overview-h" className="mt-1 font-display text-3xl font-bold tracking-tight">Lagos right now</h2>
          </div>
          <p className="text-sm text-ink-2">{confirmed} of {data.statuses.length} areas have live evidence right now</p>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.state} className={`rounded-2xl p-4 ${STATE_META[t.state].soft}`}>
              <p className={`flex items-center gap-2 text-sm font-semibold ${STATE_META[t.state].text}`}>
                <StatusDot state={t.state} /> {t.label}
              </p>
              <p className="mt-2 font-display text-4xl font-extrabold text-ink">{t.total}</p>
              <p className="text-xs text-ink-2">{t.detail}</p>
            </div>
          ))}
        </div>
        <GridCard grid={data.grid ?? null} />
        {data.storeKind === "memory" && (
          <p className="mt-3 rounded-xl bg-unsure-soft px-3 py-2 text-xs text-ink-2">Development mode: reports are stored in memory and reset when the server restarts.</p>
        )}
      </section>

      {/* Map */}
      <section aria-labelledby="map-h" className="mx-auto mt-14 max-w-6xl px-4">
        <div className="mb-4 flex items-end justify-between gap-2">
          <h2 id="map-h" className="font-display text-3xl font-bold tracking-tight">Electricity map</h2>
          <Link href="/map" className="inline-flex items-center gap-1 text-sm font-semibold text-brand">Full map <ArrowRight className="h-4 w-4" aria-hidden /></Link>
        </div>
        <LiveExplorer statuses={data.statuses} now={now} mapHeight={420} />
      </section>

      {/* Popular */}
      <section aria-labelledby="popular-h" className="mx-auto mt-14 max-w-6xl px-4">
        <h2 id="popular-h" className="font-display text-3xl font-bold tracking-tight">Popular neighbourhoods</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {popular.map((s) => (
            <AreaStatusCard key={s.areaId} status={s} now={now} />
          ))}
        </div>
      </section>

      {/* Recent + community */}
      <section className="mx-auto mt-14 grid max-w-6xl gap-6 px-4 lg:grid-cols-[1.4fr_1fr]">
        <div aria-labelledby="recent-h">
          <h2 id="recent-h" className="font-display text-3xl font-bold tracking-tight">Recent reports</h2>
          <div className="mt-5 rounded-2xl border border-line bg-surface">
            {data.recent.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <Activity className="mx-auto h-6 w-6 text-ink-3" aria-hidden />
                <p className="mt-2 font-semibold">No reports in the last 24 hours</p>
                <p className="mt-1 text-sm text-ink-2">Be the first — tell your area if light dey.</p>
                <Link href="/report" className="mt-4 inline-block rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white">Report now</Link>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {data.recent.map((r) => {
                  const a = getArea(r.areaId);
                  const st: AreaState = r.status === "on" ? "LIGHT" : "NO_LIGHT";
                  return (
                    <li key={r.id}>
                      <Link href={`/area/${r.areaId}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-bg">
                        <span className="flex min-w-0 items-center gap-3">
                          <StatusDot state={st} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">Someone in {a?.name}</span>
                            <span className="block text-xs text-ink-3">
                              reported {STATE_META[st].label.toLowerCase()}
                              {r.locationMatched && <span className="ml-1 inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" aria-hidden />location-matched</span>}
                            </span>
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-ink-3">{timeAgo(r.createdAt, now)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
        <div aria-labelledby="community-h">
          <h2 id="community-h" className="font-display text-3xl font-bold tracking-tight">Community</h2>
          <div className="mt-5 grid gap-3">
            {[
              { k: "Reports in the last 24 hours", v: data.reportsLast24h },
              { k: "Neighbours who reported", v: data.reportersLast24h },
              { k: "Areas with reports", v: `${data.areasReportedLast24h} / ${data.statuses.length}` },
            ].map((x) => (
              <div key={x.k} className="flex items-center justify-between rounded-2xl border border-line bg-surface px-5 py-4">
                <span className="text-sm text-ink-2">{x.k}</span>
                <span className="font-display text-2xl font-bold">{x.v}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

/** Live official context from NISO. Grid supply to a DisCo is not the same as light on your street. */
function GridCard({ grid }: { grid: GridContext | null }) {
  return (
    <div className="mt-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold"><Zap className="h-4 w-4 text-brand" aria-hidden /> National grid (official, NISO)</p>
        {grid && (
          <a href={grid.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-brand">
            as at {lagosTime(grid.asOf)} <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        )}
      </div>
      {grid ? (
        <>
          <p className="mt-2 text-sm text-ink">
            {grid.collapse ? <strong className="text-off">Grid collapse — all Lagos areas marked as confirmed outage. </strong> : null}
            {grid.discos.map((d) => `${d.name}: ${formatMw(d.mw)} MW`).join(" · ")}
            {grid.totalMw !== null && <span className="text-ink-3"> · all DisCos {formatMw(grid.totalMw)} MW</span>}
          </p>
          <p className="mt-1 text-xs text-ink-3">Power reaching a DisCo doesn&rsquo;t mean every feeder has light (load shedding). We only use these figures to confirm outages.</p>
        </>
      ) : (
        <p className="mt-2 text-sm text-ink-2">Official grid figures are unavailable or out of date right now, so they aren&rsquo;t being used.</p>
      )}
    </div>
  );
}
