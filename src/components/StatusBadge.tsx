import { MAP_STATE_META, STATE_META } from "@/lib/format";
import type { AreaState, MapState } from "@/lib/types";

export function StatusDot({ state, live = false, className = "", mapState }: { state: AreaState; live?: boolean; className?: string; mapState?: MapState }) {
  const m = STATE_META[state];
  const style = mapState ? MAP_STATE_META[mapState].style : "solid";
  if (style === "hollow") return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full border-2 border-dashed ${className}`} style={{ borderColor: m.hex }} aria-hidden />;
  return (
    <span
      className={`relative inline-block h-2.5 w-2.5 shrink-0 rounded-full ${m.dot} ${m.text} ${style === "solid" && mapState ? "ring-2 ring-ink/70 ring-offset-1" : ""} ${live && (state === "LIGHT" || state === "NO_LIGHT") ? "live-dot" : ""} ${className}`}
      aria-hidden
    />
  );
}

/** Badge for the evidence-based map state; falls back to the community state. */
export function StatusBadge({ state, mapState, size = "sm" }: { state: AreaState; mapState?: MapState; size?: "sm" | "lg" }) {
  const group = mapState ? MAP_STATE_META[mapState].group : state;
  const m = STATE_META[group];
  const label = mapState ? MAP_STATE_META[mapState].label : m.label;
  const hollow = mapState && MAP_STATE_META[mapState].style === "hollow";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full font-semibold ${hollow ? "border border-dashed bg-surface" : m.soft} ${m.text} ${size === "lg" ? "px-4 py-2 text-base" : "px-2.5 py-1 text-xs"}`}
      style={hollow ? { borderColor: m.hex } : undefined}
    >
      <StatusDot state={group} mapState={mapState} live />
      {label}
    </span>
  );
}
