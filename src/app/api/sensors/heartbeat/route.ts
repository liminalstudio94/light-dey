import { NextResponse, type NextRequest } from "next/server";
import { ingestHeartbeat } from "@/lib/sensors/ingest";
import { clientIp, hashNetwork } from "@/lib/server/identity";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Light Dey Sensor heartbeat (protocol v1, SENSORS.md). Signed per device; replay- and rate-limited. */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  try {
    const r = await ingestHeartbeat(getStore(), raw, req.headers.get("x-lightdey-signature"), hashNetwork(clientIp(req.headers)));
    return r.ok ? NextResponse.json({ ok: true }, { status: 202 }) : NextResponse.json({ error: r.message, code: r.code }, { status: r.status });
  } catch (e) {
    console.error("[api/sensors/heartbeat]", e);
    return NextResponse.json({ error: "Could not record heartbeat", code: "server_error" }, { status: 500 });
  }
}
