import type { Metadata } from "next";
import { MapPageClient } from "@/components/MapPageClient";
import { getOverview } from "@/lib/server/data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Live electricity map", description: "Community-reported electricity status across Lagos neighbourhoods." };

export default async function MapPage() {
  const overview = await getOverview();
  return (
    <div className="mx-auto max-w-6xl px-4 pt-8">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Live electricity map</h1>
      <p className="mt-2 max-w-2xl text-ink-2">Green and red mean at least 3 neighbours agreed in the last hour. Yellow means reports disagree. Grey means not enough recent reports.</p>
      <div className="mt-6">
        <MapPageClient initial={overview} />
      </div>
    </div>
  );
}
