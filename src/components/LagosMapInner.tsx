"use client";
import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip } from "react-leaflet";
import { getArea } from "@/lib/areas";
import { STATE_META, timeAgo } from "@/lib/format";
import type { AreaStatus } from "@/lib/types";

const LAGOS_CENTER: [number, number] = [6.53, 3.4];

export default function LagosMapInner({ statuses, now, height = 460, focusId }: { statuses: AreaStatus[]; now: number; height?: number; focusId?: string }) {
  const focus = focusId ? getArea(focusId) : undefined;
  return (
    <MapContainer
      center={focus ? [focus.lat, focus.lng] : LAGOS_CENTER}
      zoom={focus ? 12 : 11}
      minZoom={9}
      maxZoom={16}
      scrollWheelZoom={false}
      style={{ height, width: "100%" }}
      className="z-0 rounded-2xl"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        className="ld-tiles"
      />
      {statuses.map((s) => {
        const a = getArea(s.areaId);
        if (!a) return null;
        const m = STATE_META[s.state];
        const emphasised = s.state !== "UNKNOWN";
        return (
          <CircleMarker
            key={s.areaId}
            center={[a.lat, a.lng]}
            radius={a.id === focusId ? 14 : emphasised ? 11 : 8}
            pathOptions={{ color: "#ffffff", weight: 2, fillColor: m.hex, fillOpacity: emphasised ? 0.95 : 0.55 }}
          >
            <Tooltip direction="top" offset={[0, -8]}>{a.name}: {m.label}</Tooltip>
            <Popup>
              <div className="min-w-44 font-sans">
                <p className="font-display text-base font-bold text-ink">{a.name}</p>
                <p className={`mt-0.5 text-sm font-semibold ${m.text}`}>{m.label}</p>
                <p className="mt-1 text-xs text-ink-2">{s.recentReports} report{s.recentReports === 1 ? "" : "s"} in the last hour · {timeAgo(s.lastReportAt, now)}</p>
                <p className="mt-1 text-[11px] text-ink-3">Approximate area centre</p>
                <Link href={`/area/${a.id}`} className="mt-2 inline-block text-xs font-semibold text-brand">See details & history →</Link>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
