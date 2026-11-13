import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { AreaLive } from "@/components/AreaLive";
import { HistoryPanel } from "@/components/HistoryPanel";
import { ReportPanel } from "@/components/ReportPanel";
import { getArea } from "@/lib/areas";
import { getOverview } from "@/lib/server/data";
import { STATE_LABEL } from "@/lib/status";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const area = getArea(id);
  if (!area) return {};
  const overview = await getOverview();
  const s = overview.statuses.find((x) => x.areaId === id);
  const label = s ? STATE_LABEL[s.state] : "Unknown";
  return {
    title: `Is there light in ${area.name}? ${label}`,
    description: `Live community-reported electricity status for ${area.name}, ${area.lga} LGA, Lagos. ${s?.recentReports ?? 0} reports in the last hour.`,
  };
}

export default async function AreaPage({ params }: Props) {
  const { id } = await params;
  const area = getArea(id);
  if (!area) notFound();
  const overview = await getOverview();

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"><ChevronLeft className="h-4 w-4" aria-hidden /> All areas</Link>
      <header className="mt-3">
        <p className="text-sm text-ink-3">{area.lga} LGA · {area.city}</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{area.name}</h1>
      </header>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div>
          <AreaLive areaId={area.id} initial={overview} mobileReport={<ReportPanel defaultAreaId={area.id} lockArea />} />
        </div>
        <aside className="hidden lg:sticky lg:top-20 lg:block lg:self-start">
          <ReportPanel defaultAreaId={area.id} lockArea />
        </aside>
      </div>
      <div className="mt-14">
        <HistoryPanel areaId={area.id} areaName={area.name} />
      </div>
    </div>
  );
}
