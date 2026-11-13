"use client";
import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type LagosMapInner from "./LagosMapInner";

const Inner = dynamic(() => import("./LagosMapInner"), {
  ssr: false,
  loading: () => <div className="grid h-full min-h-72 place-items-center rounded-2xl bg-unknown-soft text-sm text-ink-3">Loading map…</div>,
});

export function LagosMap(props: ComponentProps<typeof LagosMapInner>) {
  return (
    <div style={{ height: props.height ?? 460 }} className="isolate overflow-hidden rounded-2xl border border-line">
      <Inner {...props} />
    </div>
  );
}
