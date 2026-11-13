import { STATE_META } from "@/lib/format";
import type { AreaState } from "@/lib/types";

export function StatusDot({ state, live = false, className = "" }: { state: AreaState; live?: boolean; className?: string }) {
  const m = STATE_META[state];
  return (
    <span className={`relative inline-block h-2.5 w-2.5 shrink-0 rounded-full ${m.dot} ${m.text} ${live && (state === "LIGHT" || state === "NO_LIGHT") ? "live-dot" : ""} ${className}`} aria-hidden />
  );
}

export function StatusBadge({ state, size = "sm" }: { state: AreaState; size?: "sm" | "lg" }) {
  const m = STATE_META[state];
  return (
    <span className={`inline-flex items-center gap-2 rounded-full font-semibold ${m.soft} ${m.text} ${size === "lg" ? "px-4 py-2 text-base" : "px-2.5 py-1 text-xs"}`}>
      <StatusDot state={state} live />
      {m.label}
    </span>
  );
}
