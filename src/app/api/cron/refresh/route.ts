import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { refreshDueSources } from "@/lib/server/refresh";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  if (!secret) return false;
  const want = Buffer.from(`Bearer ${secret}`);
  const have = Buffer.from(got);
  return have.length === want.length && timingSafeEqual(have, want);
}

/** Scheduled refresh (GitHub Actions every 10 min; Vercel Cron daily backup). Requires CRON_SECRET. */
async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  try {
    const force = req.nextUrl.searchParams.get("force") === "1";
    return NextResponse.json(await refreshDueSources({ force }), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[api/cron/refresh]", e);
    return NextResponse.json({ error: "Refresh failed", code: "server_error" }, { status: 500 });
  }
}
export const GET = handle;
export const POST = handle;
