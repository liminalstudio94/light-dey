import { distanceKm, getArea } from "./areas";
import { REPORTING_RULES } from "./config";
import type { DataStore } from "./store/types";
import type { Report, VerificationState } from "./types";
import { reportInputSchema } from "./validation";

export type SubmitResult =
  | { ok: true; report: Report }
  | { ok: false; status: number; code: "invalid" | "duplicate" | "rate_limited"; message: string };

export interface ReporterContext {
  reporterId: string;
  networkHash: string;
  now?: Date;
}

const MIN = 60_000;

/**
 * The single entry point for creating a report. All anti-abuse rules run here,
 * server-side, before anything is written.
 */
export async function submitReport(store: DataStore, body: unknown, ctx: ReporterContext): Promise<SubmitResult> {
  const parsed = reportInputSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: 400, code: "invalid", message: parsed.error.issues[0]?.message ?? "Invalid report" };
  }
  const input = parsed.data;
  const now = ctx.now ?? new Date();

  const rl = REPORTING_RULES.reporterLimit;
  const mine = await store.reportsByReporter(ctx.reporterId, new Date(now.getTime() - Math.max(rl.windowMinutes, REPORTING_RULES.duplicateWindowMinutes) * MIN));

  const dupSince = now.getTime() - REPORTING_RULES.duplicateWindowMinutes * MIN;
  if (mine.some((r) => r.areaId === input.areaId && r.status === input.status && Date.parse(r.createdAt) >= dupSince)) {
    return { ok: false, status: 409, code: "duplicate", message: `You already reported this in the last ${REPORTING_RULES.duplicateWindowMinutes} minutes. Thanks!` };
  }

  const rlSince = now.getTime() - rl.windowMinutes * MIN;
  if (mine.filter((r) => Date.parse(r.createdAt) >= rlSince).length >= rl.max) {
    return { ok: false, status: 429, code: "rate_limited", message: "Too many reports. Please try again in a few minutes." };
  }

  const nl = REPORTING_RULES.networkLimit;
  if ((await store.countByNetwork(ctx.networkHash, new Date(now.getTime() - nl.windowMinutes * MIN))) >= nl.max) {
    return { ok: false, status: 429, code: "rate_limited", message: "Too many reports from this network. Please try again later." };
  }

  let verification: VerificationState = "unverified";
  if (input.lat !== undefined && input.lng !== undefined) {
    const area = getArea(input.areaId)!;
    verification = distanceKm(input.lat, input.lng, area.lat, area.lng) <= REPORTING_RULES.locationMatchKm ? "location_matched" : "location_mismatch";
  }

  const report = await store.insertReport({
    areaId: input.areaId,
    status: input.status,
    reporterId: ctx.reporterId,
    networkHash: ctx.networkHash,
    createdAt: now.toISOString(),
    verification,
    comment: input.comment ?? null,
    lat: input.lat,
    lng: input.lng,
  });
  return { ok: true, report };
}
