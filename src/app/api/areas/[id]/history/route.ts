import { NextResponse, type NextRequest } from "next/server";
import { getArea } from "@/lib/areas";
import { getAreaHistory } from "@/lib/server/data";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getArea(id)) return NextResponse.json({ error: "Unknown neighbourhood" }, { status: 404 });
  const days = req.nextUrl.searchParams.get("days") === "30" ? 30 : 7;
  try {
    return NextResponse.json(await getAreaHistory(id, days), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[api/history]", e);
    return NextResponse.json({ error: "Could not load history" }, { status: 500 });
  }
}
