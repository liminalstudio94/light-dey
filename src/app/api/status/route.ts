import { after, NextResponse } from "next/server";
import { getOverview } from "@/lib/server/data";
import { refreshDueSources } from "@/lib/server/refresh";

export const dynamic = "force-dynamic";

export async function GET() {
  // Opportunistic refresh after responding: leases keep it to one fetch per source interval.
  if (process.env.LIGHTDEY_ONDEMAND_REFRESH !== "0") {
    try {
      after(() => refreshDueSources().catch((e) => console.error("[status:refresh]", e)));
    } catch {
      /* outside a request scope (tests) */
    }
  }
  try {
    const overview = await getOverview();
    return NextResponse.json(overview, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[api/status]", e);
    return NextResponse.json({ error: "Could not load status" }, { status: 500 });
  }
}
