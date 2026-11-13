import type { PowerStatus, Report, VerificationState } from "@/lib/types";

export const NOW = new Date("2026-11-13T12:00:00.000Z");
let n = 0;
export function rep(status: PowerStatus, minutesAgo: number, reporterId: string, opts: { areaId?: string; net?: string; verification?: VerificationState; now?: Date } = {}): Report {
  const now = opts.now ?? NOW;
  return {
    id: `r${++n}`,
    areaId: opts.areaId ?? "yaba",
    status,
    reporterId,
    networkHash: opts.net ?? `net-${reporterId}`,
    createdAt: new Date(now.getTime() - minutesAgo * 60_000).toISOString(),
    verification: opts.verification ?? "unverified",
  };
}
