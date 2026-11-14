"use client";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Info } from "lucide-react";
import type { HistoryStats } from "@/lib/history";
import { STATUS_CONFIG } from "@/lib/config";
import { hourLabel } from "@/lib/format";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-xs text-ink-3">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-ink-3">{hint}</p>}
    </div>
  );
}

export function HistoryPanel({ areaId, areaName }: { areaId: string; areaName: string }) {
  const [days, setDays] = useState<7 | 30>(7);
  const [data, setData] = useState<HistoryStats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setError(false);
    fetch(`/api/areas/${areaId}/history?days=${days}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [areaId, days]);

  const fmt = (v: number | null, unit = "") => (v === null ? "—" : `${v}${unit}`);
  const empty = data && data.coveragePct === 0;

  return (
    <section aria-labelledby="history-h">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="history-h" className="font-display text-2xl font-bold">Electricity history</h2>
          <p className="mt-1 text-sm text-ink-2">Built only from confirmed community reports for {areaName}.</p>
        </div>
        <div role="tablist" aria-label="History range" className="inline-flex rounded-full border border-line bg-surface p-1 text-sm">
          {([7, 30] as const).map((d) => (
            <button key={d} role="tab" type="button" aria-selected={days === d} onClick={() => setDays(d)} className={`rounded-full px-3 py-1.5 font-medium ${days === d ? "bg-ink text-white" : "text-ink-2"}`}>
              {d} days
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mt-6 rounded-xl bg-off-soft px-4 py-3 text-sm text-off">Could not load history. Check your connection and try again.</p>}
      {!data && !error && <div className="mt-6 h-40 animate-pulse rounded-2xl bg-unknown-soft" />}

      {data && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Reliability score" value={fmt(data.reliabilityScore, "/100")} hint="Availability, discounted when coverage is thin" />
            <Stat label="Avg light per day" value={fmt(data.avgDailyLightHours, " hrs")} hint="Confirmed hours only" />
            <Stat label="Outages observed" value={String(data.outages)} hint={data.avgOutageHours ? `Avg ${data.avgOutageHours} hrs each` : "No average yet"} />
            <Stat label="Data coverage" value={`${data.coveragePct}%`} hint={`of ${data.days * 24} hours had a confirmed status`} />
          </div>

          {empty ? (
            <div className="mt-6 rounded-2xl border border-dashed border-line bg-surface px-5 py-8 text-center">
              <p className="font-display text-lg font-bold">No confirmed history yet</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-ink-2">History appears once at least {STATUS_CONFIG.confirmationThreshold} neighbours confirm the status. Report what you see and share this page so others can too.</p>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-line bg-surface p-4">
                <h3 className="text-sm font-semibold">Hours per day</h3>
                <div className="mt-3 h-56">
                  <ResponsiveContainer>
                    <BarChart data={data.daily.map((d) => ({ ...d, label: d.date.slice(5) }))} margin={{ left: -24, right: 4 }}>
                      <CartesianGrid vertical={false} stroke="#ecebe6" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#7c818b" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                      <YAxis domain={[0, 24]} ticks={[0, 6, 12, 18, 24]} tick={{ fontSize: 11, fill: "#7c818b" }} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{ fill: "#f6f5f1" }} contentStyle={{ borderRadius: 12, border: "1px solid #e4e2dc", fontSize: 12 }} />
                      <Bar dataKey="lightHours" name="Light" stackId="a" fill="#16a34a" />
                      <Bar dataKey="noLightHours" name="No light" stackId="a" fill="#dc2626" />
                      <Bar dataKey="unknownHours" name="Unknown" stackId="a" fill="#d9dbdf" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="rounded-2xl border border-line bg-surface p-4">
                <h3 className="text-sm font-semibold">Light by hour of day (% of confirmed hours)</h3>
                <div className="mt-3 h-56">
                  <ResponsiveContainer>
                    <BarChart data={data.byHour.map((h) => ({ ...h, label: hourLabel(h.hour), value: h.lightPct ?? 0 }))} margin={{ left: -24, right: 4 }}>
                      <CartesianGrid vertical={false} stroke="#ecebe6" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#7c818b" }} tickLine={false} axisLine={false} interval={3} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#7c818b" }} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{ fill: "#f6f5f1" }} contentStyle={{ borderRadius: 12, border: "1px solid #e4e2dc", fontSize: 12 }} formatter={(v, _n, p) => [`${v}% (${(p.payload as { samples: number }).samples} hrs of data)`, "Light"]} />
                      <Bar dataKey="value" name="Light" fill="#2f5bff" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-line bg-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-on">Best hours (estimate)</p>
              <p className="mt-1 text-sm text-ink">{data.bestHours.length ? data.bestHours.map(hourLabel).join(", ") : "Not enough data yet"}</p>
            </div>
            <div className="rounded-2xl border border-line bg-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-off">Most outages (estimate)</p>
              <p className="mt-1 text-sm text-ink">{data.worstHours.length ? data.worstHours.map(hourLabel).join(", ") : "Not enough data yet"}</p>
            </div>
            <div className="rounded-2xl border border-line bg-surface p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Best day (estimate)</p>
              <p className="mt-1 text-sm text-ink">
                {(() => {
                  const best = data.byWeekday.filter((d) => d.samples >= 6 && d.lightPct !== null).sort((a, b) => b.lightPct! - a.lightPct!)[0];
                  return best ? `${DAYS[best.day]} (${best.lightPct}% light)` : "Not enough data yet";
                })()}
              </p>
            </div>
          </div>

          <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-ink-3">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            These numbers come from community reports, not the electricity distribution company. Hours with no confirmed reports count as unknown, so low coverage means
            less accurate statistics. Best hours are statistical estimates from past reports — not a guarantee.
          </p>
        </>
      )}
    </section>
  );
}
