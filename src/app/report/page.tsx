import type { Metadata } from "next";
import { ReportPanel } from "@/components/ReportPanel";

export const metadata: Metadata = { title: "Report light status", description: "Tell your neighbours if there is light in your area right now." };

export default function ReportPage() {
  return (
    <div className="mx-auto max-w-xl px-4 pt-8">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Is there light where you are?</h1>
      <p className="mt-2 text-ink-2">One tap. Anonymous. It takes 3 neighbours agreeing within an hour to turn an area green or red.</p>
      <div className="mt-6">
        <ReportPanel />
      </div>
    </div>
  );
}
