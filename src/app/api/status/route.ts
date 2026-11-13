import { NextResponse } from "next/server";
import { getOverview } from "@/lib/server/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const overview = await getOverview();
    return NextResponse.json(overview, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[api/status]", e);
    return NextResponse.json({ error: "Could not load status" }, { status: 500 });
  }
}
