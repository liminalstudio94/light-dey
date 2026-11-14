import type { Metadata } from "next";
import { MapPageClient } from "@/components/MapPageClient";
import { STATUS_CONFIG } from "@/lib/config";
import { getOverview } from "@/lib/server/data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Live electricity map", description: "Community-reported electricity status across Lagos neighbourhoods." };

export default async function MapPage() {
  const overview = await getOverview();
  return (
    <div className="mx-auto max-w-6xl px-4 pt-8">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Live electricity map</h1>
      <p className="mt-2 max-w-2xl text-ink-2">Dark-ringed dots are confirmed (measured by a sensor or official data); dashed rings are likely (indirect evidence); plain green/red is reported ({STATUS_CONFIG.confirmationThreshold}+ neighbours or a verified reporter); yellow means sources disagree; hollow is a historical prediction; grey means not enough current evidence.</p>
      <div className="mt-6">
        <MapPageClient initial={overview} />
      </div>
    </div>
  );
}
