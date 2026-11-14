import { NextResponse, type NextRequest } from "next/server";
import { allowNetwork, readBodyLimited } from "@/lib/sensors/guard";
import { ingestHeartbeat } from "@/lib/sensors/ingest";
import { MAX_BODY_BYTES } from "@/lib/sensors/protocol";
import { clientIp, hashNetwork } from "@/lib/server/identity";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Light Dey Sensor heartbeat (protocol v1, SENSORS.md). Signed per device; replay- and rate-limited. */
export async function POST(req: NextRequest) {
  const tooLarge = () => NextResponse.json({ error: "Heartbeat too large", code: "too_large" }, { status: 413 });
  // Reject on the declared length first, then enforce the budget while streaming — never buffer a big body.
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return tooLarge();
  const network = hashNetwork(clientIp(req.headers));
  if (!allowNetwork(network)) return NextResponse.json({ error: "Too many requests", code: "rate_limited" }, { status: 429 });
  const raw = await readBodyLimited(req.body, MAX_BODY_BYTES);
  if (raw === null) return tooLarge();
  try {
    const r = await ingestHeartbeat(getStore(), raw, req.headers.get("x-lightdey-signature"), network);
    return r.ok ? NextResponse.json({ ok: true }, { status: 202 }) : NextResponse.json({ error: r.message, code: r.code }, { status: r.status });
  } catch (e) {
    console.error("[api/sensors/heartbeat]", e);
    return NextResponse.json({ error: "Could not record heartbeat", code: "server_error" }, { status: 500 });
  }
}
