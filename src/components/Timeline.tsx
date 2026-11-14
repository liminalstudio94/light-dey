"use client";
import { useEffect, useState } from "react";
import { MAP_STATE_META, STATE_META, lagosTime, timeAgo } from "@/lib/format";
import type { MapState } from "@/lib/types";
import { StatusDot } from "./StatusBadge";

interface Entry {
  mapState: MapState;
  confidence: string;
  at: string;
  basis: string | null;
}

/** Recent status changes for an area, with the evidence that decided each one. */
export function Timeline({ areaId }: { areaId: string }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/areas/${areaId}/timeline`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => alive && setEntries(d.entries))
      .catch(() => alive && setEntries([]));
    return () => {
      alive = false;
    };
  }, [areaId]);
  return (
    <section aria-labelledby="timeline-h" className="mt-8">
      <h2 id="timeline-h" className="font-display text-2xl font-bold">Recent changes</h2>
      {entries === null ? (
        <div className="mt-3 h-16 animate-pulse rounded-2xl bg-unknown-soft" />
      ) : entries.length === 0 ? (
        <p className="mt-3 text-sm text-ink-2">No status changes recorded in the last 48 hours.</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {entries.map((e) => {
            const m = MAP_STATE_META[e.mapState];
            return (
              <li key={e.at} className="flex items-start gap-3 rounded-xl border border-line bg-surface px-3 py-2 text-sm">
                <StatusDot state={m.group} mapState={e.mapState} className="mt-1.5" />
                <div className="min-w-0">
                  <p className={`font-semibold ${STATE_META[m.group].text}`}>{m.label}</p>
                  {e.basis && <p className="text-xs text-ink-2">{e.basis}</p>}
                  <p className="text-xs text-ink-3">{lagosTime(e.at)} · {timeAgo(e.at)} · {e.confidence} confidence</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
