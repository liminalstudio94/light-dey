"use client";
import type { Overview } from "@/lib/types";
import { AreaSearch } from "./AreaSearch";
import { LiveExplorer } from "./LiveExplorer";
import { useOverview } from "./useOverview";

export function MapPageClient({ initial }: { initial: Overview }) {
  const data = useOverview(initial);
  const states = Object.fromEntries(data.statuses.map((s) => [s.areaId, s.state]));
  const mapStates = Object.fromEntries(data.statuses.filter((s) => s.mapState).map((s) => [s.areaId, s.mapState!]));
  return (
    <>
      <div className="mb-5 max-w-xl">
        <AreaSearch states={states} mapStates={mapStates} size="md" />
      </div>
      <LiveExplorer statuses={data.statuses} now={Date.parse(data.generatedAt)} mapHeight={560} />
    </>
  );
}
