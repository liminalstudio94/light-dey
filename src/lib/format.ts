import { TIMEZONE } from "./config";
import type { AreaState, Confidence, Freshness } from "./types";

export function timeAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return "No reports yet";
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr${h > 1 ? "s" : ""} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d > 1 ? "s" : ""} ago`;
}

export function lagosTime(iso: string): string {
  return new Intl.DateTimeFormat("en-NG", { timeZone: TIMEZONE, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));
}

export function hourLabel(h: number): string {
  const suffix = h < 12 ? "am" : "pm";
  const n = h % 12 === 0 ? 12 : h % 12;
  return `${n}${suffix}`;
}

export const STATE_META: Record<AreaState, { label: string; short: string; dot: string; soft: string; text: string; hex: string }> = {
  LIGHT: { label: "Light dey", short: "Light", dot: "bg-on", soft: "bg-on-soft", text: "text-on", hex: "#16a34a" },
  NO_LIGHT: { label: "No light", short: "No light", dot: "bg-off", soft: "bg-off-soft", text: "text-off", hex: "#dc2626" },
  UNCERTAIN: { label: "Uncertain", short: "Mixed", dot: "bg-unsure", soft: "bg-unsure-soft", text: "text-unsure", hex: "#ca8a04" },
  UNKNOWN: { label: "Unknown", short: "Unknown", dot: "bg-unknown", soft: "bg-unknown-soft", text: "text-unknown", hex: "#8b9099" },
};

export const FRESHNESS_LABEL: Record<Freshness, string> = { fresh: "Fresh", recent: "Recent", ageing: "Ageing", stale: "Stale", none: "No data" };
export const CONFIDENCE_LABEL: Record<Confidence, string> = { high: "High confidence", medium: "Medium confidence", low: "Low confidence", none: "No confidence yet" };
