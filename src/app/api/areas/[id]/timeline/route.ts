import { NextResponse, type NextRequest } from "next/server";
import { getArea } from "@/lib/areas";
import { getAreaTimeline } from "@/lib/server/data";

export const dynamic = "force-dynamic";

/** Recent map-state changes for an area (status_snapshots), newest first. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getArea(id)) return NextResponse.json({ error: "Unknown neighbourhood" }, { status: 404 });
  try {
    return NextResponse.json({ areaId: id, entries: await getAreaTimeline(id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[api/timeline]", e);
    return NextResponse.json({ error: "Could not load timeline" }, { status: 500 });
  }
}
