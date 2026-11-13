"use client";
import { useMemo, useState } from "react";
import { List, Map as MapIcon } from "lucide-react";
import { AREAS } from "@/lib/areas";
import { STATE_META } from "@/lib/format";
import type { AreaState, AreaStatus } from "@/lib/types";
import { AreaStatusCard } from "./AreaStatusCard";
import { LagosMap } from "./LagosMap";
import { StatusDot } from "./StatusBadge";

const ORDER: AreaState[] = ["LIGHT", "NO_LIGHT", "UNCERTAIN", "UNKNOWN"];
const RANK: Record<AreaState, number> = { LIGHT: 0, NO_LIGHT: 1, UNCERTAIN: 2, UNKNOWN: 3 };

/** Map + list of every area with status filters. */
export function LiveExplorer({ statuses, now, defaultView = "map", mapHeight = 460 }: { statuses: AreaStatus[]; now: number; defaultView?: "map" | "list"; mapHeight?: number }) {
  const [view, setView] = useState(defaultView);
  const [filter, setFilter] = useState<Set<AreaState>>(new Set(ORDER));

  const counts = useMemo(() => {
    const c = { LIGHT: 0, NO_LIGHT: 0, UNCERTAIN: 0, UNKNOWN: 0 } as Record<AreaState, number>;
    statuses.forEach((s) => c[s.state]++);
    return c;
  }, [statuses]);

  const visible = useMemo(() => {
    const name = new Map(AREAS.map((a) => [a.id, a.name]));
    return statuses
      .filter((s) => filter.has(s.state))
      .sort((a, b) => RANK[a.state] - RANK[b.state] || (b.lastReportAt ?? "").localeCompare(a.lastReportAt ?? "") || (name.get(a.areaId) ?? "").localeCompare(name.get(b.areaId) ?? ""));
  }, [statuses, filter]);

  const toggle = (s: AreaState) =>
    setFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s) && next.size > 1) next.delete(s);
      else next.add(s);
      return next;
    });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
          {ORDER.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={filter.has(s)}
              onClick={() => toggle(s)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition ${filter.has(s) ? "border-ink/15 bg-surface text-ink" : "border-transparent bg-transparent text-ink-3 line-through"}`}
            >
              <StatusDot state={s} /> {STATE_META[s].label} <span className="text-ink-3">{counts[s]}</span>
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
          <p className="mt-2 text-xs text-ink-3">Dots mark approximate neighbourhood centres, not exact boundaries. Tap a dot for details.</p>
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
