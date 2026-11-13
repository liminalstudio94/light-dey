import { NextResponse, type NextRequest } from "next/server";
import { submitReport } from "@/lib/reports";
import { getStore } from "@/lib/store";
import { REPORTER_COOKIE, clientIp, hashNetwork, readOrCreateReporterId } from "@/lib/server/identity";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Same-origin only: blocks drive-by cross-site form posts.
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) {
    return NextResponse.json({ error: "Cross-origin requests are not allowed", code: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON", code: "invalid" }, { status: 400 });
  }

  const { id, isNew } = readOrCreateReporterId(req.cookies.get(REPORTER_COOKIE)?.value);
  try {
    const result = await submitReport(getStore(), body, { reporterId: id, networkHash: hashNetwork(clientIp(req.headers)) });
    const res = result.ok
      ? NextResponse.json({ ok: true, report: { id: result.report.id, areaId: result.report.areaId, status: result.report.status, createdAt: result.report.createdAt, verification: result.report.verification } }, { status: 201 })
      : NextResponse.json({ error: result.message, code: result.code }, { status: result.status });
    if (isNew) res.cookies.set(REPORTER_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365, path: "/" });
    return res;
  } catch (e) {
    console.error("[api/reports]", e);
    return NextResponse.json({ error: "Could not save report", code: "server_error" }, { status: 500 });
  }
}
