import "server-only";
import { createHmac, randomUUID } from "node:crypto";

export const REPORTER_COOKIE = "ld_rid";

function salt() {
  const s = process.env.REPORTER_HASH_SECRET;
  if (!s && process.env.NODE_ENV === "production") throw new Error("REPORTER_HASH_SECRET is not set");
  return s ?? "dev-only-salt";
}

/** One-way hash so we can rate-limit per network without storing raw IPs. */
export function hashNetwork(ip: string): string {
  return createHmac("sha256", salt()).update(`net:${ip}`).digest("hex").slice(0, 32);
}

export function clientIp(headers: Headers): string {
  return headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

const ID_RE = /^[0-9a-f-]{36}$/;
export function readOrCreateReporterId(cookieValue: string | undefined): { id: string; isNew: boolean } {
  if (cookieValue && ID_RE.test(cookieValue)) return { id: cookieValue, isNew: false };
  return { id: randomUUID(), isNew: true };
}
