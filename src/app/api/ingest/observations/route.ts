import { NextResponse, type NextRequest } from "next/server";
import { ingestPartnerObservation } from "@/lib/partner";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** POST a neighbourhood status from an approved partner or verified reporter. See SOURCES.md#partner-api. */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON", code: "invalid" }, { status: 400 });
  }
  try {
    const r = await ingestPartnerObservation(getStore(), req.headers.get("authorization"), body);
    return r.ok ? NextResponse.json({ ok: true, written: r.written }, { status: r.written ? 201 : 200 }) : NextResponse.json({ error: r.message, code: r.code }, { status: r.status });
  } catch (e) {
    console.error("[api/ingest]", e);
    return NextResponse.json({ error: "Could not ingest", code: "server_error" }, { status: 500 });
  }
}
