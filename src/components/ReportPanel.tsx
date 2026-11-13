"use client";
import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Crosshair, Loader2, Power, PowerOff } from "lucide-react";
import { AREAS, getArea, nearestAreas } from "@/lib/areas";
import { REPORTING_RULES } from "@/lib/config";
import type { PowerStatus } from "@/lib/types";

type Msg = { kind: "ok" | "error" | "info"; text: string } | null;

export function ReportPanel({ defaultAreaId, lockArea = false }: { defaultAreaId?: string; lockArea?: boolean }) {
  const router = useRouter();
  const uid = useId();
  const [areaId, setAreaId] = useState(defaultAreaId ?? "");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [comment, setComment] = useState("");
  const [showComment, setShowComment] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [sending, setSending] = useState<PowerStatus | null>(null);
  const [msg, setMsg] = useState<Msg>(null);

  const grouped = useMemo(() => {
    const g = new Map<string, typeof AREAS>();
    [...AREAS].sort((a, b) => a.name.localeCompare(b.name)).forEach((a) => g.set(a.lga, [...(g.get(a.lga) ?? []), a]));
    return [...g.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, []);

  const locate = () => {
    if (!("geolocation" in navigator)) {
      setMsg({ kind: "error", text: "Your browser can't share location. Pick your area from the list instead." });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const [near] = nearestAreas(c.lat, c.lng, 1);
        if (!near || near.km > 10) {
          setCoords(null);
          setMsg({ kind: "info", text: "You seem to be outside our supported Lagos areas. You can still pick an area manually." });
          return;
        }
        setCoords(c);
        if (!lockArea) setAreaId(near.area.id);
        setMsg({ kind: "info", text: `Location added. Nearest area: ${near.area.name} (~${near.km.toFixed(1)} km from its centre).` });
      },
      () => {
        setLocating(false);
        setMsg({ kind: "info", text: "Location not shared — that's fine. Pick your area from the list." });
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 120_000 },
    );
  };

  const submit = async (status: PowerStatus) => {
    if (!areaId) {
      setMsg({ kind: "error", text: "Choose your area first." });
      return;
    }
    setSending(status);
    setMsg(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ areaId, status, comment: comment.trim() || undefined, website: honeypot || undefined, ...(coords ?? {}) }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        const name = getArea(areaId)?.name ?? "your area";
        setMsg({ kind: "ok", text: `Thanks! Your “${status === "on" ? "Light dey" : "No light"}” report for ${name} is in. It takes 3 neighbours to confirm.` });
        setComment("");
        setShowComment(false);
        window.dispatchEvent(new Event("lightdey:reported"));
        router.refresh();
      } else {
        setMsg({ kind: res.status === 409 ? "info" : "error", text: json.error ?? "Could not send your report. Try again." });
      }
    } catch {
      setMsg({ kind: "error", text: "You seem to be offline. Try again when you have network." });
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
      {!lockArea && (
        <div className="mb-4">
          <label htmlFor="report-area" className="text-sm font-semibold text-ink">Your area</label>
          <div className="mt-2 flex gap-2">
            <select
              id="report-area"
              value={areaId}
              onChange={(e) => {
                setAreaId(e.target.value);
                setCoords(null);
              }}
              className="h-12 w-full min-w-0 rounded-xl border border-line bg-bg px-3 text-base text-ink"
            >
              <option value="">Select neighbourhood…</option>
              {grouped.map(([lga, list]) => (
                <optgroup key={lga} label={`${lga} LGA`}>
                  {list.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button type="button" onClick={locate} disabled={locating} className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium text-ink-2 hover:bg-bg disabled:opacity-60" aria-label="Use my location">
              {locating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Crosshair className="h-4 w-4" aria-hidden />}
              <span className="hidden sm:inline">Use location</span>
            </button>
          </div>
        </div>
      )}
      {lockArea && (
        <div className="mb-4 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ink">Are you in {getArea(areaId)?.name} now?</p>
          <button type="button" onClick={locate} disabled={locating} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-ink-2 hover:bg-bg">
            {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Crosshair className="h-3.5 w-3.5" aria-hidden />} Add my location
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => submit("on")} disabled={!!sending} className="group flex h-28 flex-col items-center justify-center gap-2 rounded-2xl bg-on text-white shadow-[0_10px_30px_-12px_rgba(22,163,74,0.7)] transition active:scale-[0.98] disabled:opacity-70 sm:h-32">
          {sending === "on" ? <Loader2 className="h-7 w-7 animate-spin" aria-hidden /> : <Power className="h-7 w-7" aria-hidden />}
          <span className="font-display text-xl font-extrabold tracking-tight">LIGHT DEY</span>
        </button>
        <button type="button" onClick={() => submit("off")} disabled={!!sending} className="group flex h-28 flex-col items-center justify-center gap-2 rounded-2xl bg-ink text-white shadow-[0_10px_30px_-12px_rgba(15,17,21,0.7)] transition active:scale-[0.98] disabled:opacity-70 sm:h-32">
          {sending === "off" ? <Loader2 className="h-7 w-7 animate-spin" aria-hidden /> : <PowerOff className="h-7 w-7 text-off" aria-hidden />}
          <span className="font-display text-xl font-extrabold tracking-tight">NO LIGHT</span>
        </button>
      </div>

      {/* Honeypot: hidden from people and assistive tech; bots tend to fill it. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Website<input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} /></label>
      </div>

      {showComment ? (
        <div className="mt-4">
          <label htmlFor={`${uid}-comment`} className="text-xs font-medium text-ink-2">Short note (optional)</label>
          <input id={`${uid}-comment`} maxLength={REPORTING_RULES.commentMaxLength} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="e.g. Came on 10 mins ago on our street" className="mt-1 h-11 w-full rounded-xl border border-line bg-bg px-3 text-sm" />
        </div>
      ) : (
        <button type="button" onClick={() => setShowComment(true)} className="mt-3 text-xs font-medium text-ink-3 hover:text-ink">+ Add a short note</button>
      )}

      <div aria-live="polite" className="min-h-0">
        {msg && (
          <p className={`mt-4 flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm ${msg.kind === "ok" ? "bg-on-soft text-on" : msg.kind === "error" ? "bg-off-soft text-off" : "bg-bg text-ink-2"}`}>
            {msg.kind === "ok" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
            {msg.text}
          </p>
        )}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-ink-3">
        Reports are anonymous. Location is optional and only used to mark your report as “location-matched” — it doesn’t prove where you are.
      </p>
    </div>
  );
}
