import type { Metadata } from "next";
import { ReportPanel } from "@/components/ReportPanel";
import { STATUS_CONFIG } from "@/lib/config";

export const metadata: Metadata = { title: "Report light status", description: "Tell your neighbours if there is light in your area right now." };

export default function ReportPage() {
  return (
    <div className="mx-auto max-w-xl px-4 pt-8">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">Is there light where you are?</h1>
      <p className="mt-2 text-ink-2">One tap. Anonymous. It takes {STATUS_CONFIG.confirmationThreshold} neighbours agreeing within an hour to mark an area as reported.</p>
      <div className="mt-6">
        <ReportPanel />
      </div>
    </div>
  );
}
