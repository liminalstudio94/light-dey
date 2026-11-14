"use client";
import { useMemo, useState } from "react";
import { List, Map as MapIcon } from "lucide-react";
import { AREAS } from "@/lib/areas";
import { STATUS_CONFIG } from "@/lib/config";
import { MAP_STATE_META } from "@/lib/format";
import type { AreaStatus, MapState } from "@/lib/types";
import { AreaStatusCard } from "./AreaStatusCard";
import { LagosMap } from "./LagosMap";
import { StatusDot } from "./StatusBadge";

const ORDER: MapState[] = ["CONFIRMED_ON", "COMMUNITY_ON", "CONFIRMED_OFF", "COMMUNITY_OFF", "CONFLICTING", "ESTIMATED_ON", "ESTIMATED_OFF", "UNKNOWN"];
const RANK = Object.fromEntries(ORDER.map((m, i) => [m, i])) as Record<MapState, number>;
const ms = (s: AreaStatus): MapState => s.mapState ?? "UNKNOWN";

/** Map + list of every area with status filters. */
export function LiveExplorer({ statuses, now, defaultView = "map", mapHeight = 460 }: { statuses: AreaStatus[]; now: number; defaultView?: "map" | "list"; mapHeight?: number }) {
  const [view, setView] = useState(defaultView);
  const [hidden, setHidden] = useState<Set<MapState>>(new Set());

  const counts = useMemo(() => {
    const c = Object.fromEntries(ORDER.map((m) => [m, 0])) as Record<MapState, number>;
    statuses.forEach((s) => c[ms(s)]++);
    return c;
  }, [statuses]);
  // Only offer filters for states that are on the map right now (Unknown always).
  const present = ORDER.filter((m) => counts[m] > 0 || m === "UNKNOWN");

  const visible = useMemo(() => {
    const name = new Map(AREAS.map((a) => [a.id, a.name]));
    return statuses
      .filter((s) => !hidden.has(ms(s)))
      .sort((a, b) => RANK[ms(a)] - RANK[ms(b)] || (b.lastReportAt ?? "").localeCompare(a.lastReportAt ?? "") || (name.get(a.areaId) ?? "").localeCompare(name.get(b.areaId) ?? ""));
  }, [statuses, hidden]);

  const toggle = (m: MapState) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      // Never let the last state that actually has areas be hidden.
      else if (present.filter((p) => !next.has(p) && counts[p] > 0 && p !== m).length > 0 || counts[m] === 0) next.add(m);
      return next;
    });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
          {present.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={!hidden.has(m)}
              title={MAP_STATE_META[m].help}
              onClick={() => toggle(m)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition ${!hidden.has(m) ? "border-ink/15 bg-surface text-ink" : "border-transparent bg-transparent text-ink-3 line-through"}`}
            >
              <StatusDot state={MAP_STATE_META[m].group} mapState={m} /> {MAP_STATE_META[m].label} <span className="text-ink-3">{counts[m]}</span>
            </button>
          ))}
        </div>
        <div role="tablist" aria-label="View" className="inline-flex rounded-full border border-line bg-surface p-1 text-sm">
          {(["map", "list"] as const).map((v) => (
            <button key={v} role="tab" type="button" aria-selected={view === v} onClick={() => setView(v)} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium ${view === v ? "bg-ink text-white" : "text-ink-2"}`}>
              {v === "map" ? <MapIcon className="h-4 w-4" aria-hidden /> : <List className="h-4 w-4" aria-hidden />}
              {v === "map" ? "Map" : "List"}
            </button>
          ))}
        </div>
      </div>
      {view === "map" ? (
        <>
          <LagosMap statuses={visible} now={now} height={mapHeight} />
          <MapLegend />
          <p className="mt-2 text-xs text-ink-3">Dots mark approximate neighbourhood centres, not exact boundaries. Tap a dot for details and sources.</p>
        </>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((s) => (
            <AreaStatusCard key={s.areaId} status={s} now={now} />
          ))}
        </div>
      )}
    </div>
  );
}

function MapLegend() {
  const rows: { m: MapState; label: string }[] = [
    { m: "CONFIRMED_OFF", label: "Dark ring = confirmed (official / verified)" },
    { m: "COMMUNITY_ON", label: `Plain = reported by ${STATUS_CONFIG.confirmationThreshold}+ neighbours` },
    { m: "ESTIMATED_ON", label: "Dashed = estimate from history, not live" },
    { m: "UNKNOWN", label: "Grey = not enough verified data" },
  ];
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Map legend">
      {rows.map((r) => (
        <li key={r.m} className="flex items-center gap-1.5">
          <StatusDot state={MAP_STATE_META[r.m].group} mapState={r.m} /> {r.label}
        </li>
      ))}
    </ul>
  );
}
