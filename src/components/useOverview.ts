"use client";
import { useEffect, useState } from "react";
import type { Overview } from "@/lib/types";

const POLL_MS = 30_000;

/** Keeps the live overview fresh. Pauses while the tab is hidden to save data. */
export function useOverview(initial: Overview) {
  const [data, setData] = useState(initial);
  useEffect(() => {
    let stopped = false;
    const load = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        if (res.ok && !stopped) setData(await res.json());
      } catch {
        /* offline: keep last data, the UI shows its age */
      }
    };
    const t = setInterval(load, POLL_MS);
    const onVis = () => !document.hidden && load();
    const onReport = () => load();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("lightdey:reported", onReport);
    return () => {
      stopped = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("lightdey:reported", onReport);
    };
  }, []);
  return data;
}
