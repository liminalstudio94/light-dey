import { SENSOR_CONFIG } from "../config";
import type { DataStore } from "../store/types";
import { isKnownUnknown, rememberUnknown } from "./guard";
import { MAX_BODY_BYTES, deviceSecret, heartbeatSchema, verifySignature } from "./protocol";

export type HeartbeatResult = { ok: true } | { ok: false; status: number; code: string; message: string };

/**
 * Accepts one signed heartbeat. Order matters: cheap checks first, then authentication,
 * then the atomic replay / rate-limit write. Auth failures are deliberately generic.
 */
export async function ingestHeartbeat(store: DataStore, rawBody: string, signature: string | null, networkHash: string, now: Date = new Date()): Promise<HeartbeatResult> {
  const deny = { ok: false as const, status: 401, code: "unauthorized", message: "Unknown device or bad signature" };
  if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) return { ok: false, status: 413, code: "too_large", message: "Heartbeat too large" };
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return { ok: false, status: 400, code: "invalid", message: "Body must be JSON" };
  }
  const parsed = heartbeatSchema.safeParse(json);
  if (!parsed.success) return { ok: false, status: 400, code: "invalid", message: parsed.error.issues[0]?.message ?? "Invalid heartbeat" };
  const hb = parsed.data;

  // Unknown ids seen recently are answered from memory — repeated junk never reaches the database.
  if (isKnownUnknown(hb.deviceId, now.getTime())) return deny;
  const device = await store.getDevice(hb.deviceId);
  if (!device || device.revoked) {
    rememberUnknown(hb.deviceId, now.getTime());
    return deny;
  }
  if (!verifySignature(rawBody, signature, deviceSecret(hb.deviceId))) return deny;

  const skew = Math.round(now.getTime() / 1000 - hb.ts);
  if (Math.abs(skew) > SENSOR_CONFIG.maxClockSkewSeconds) return { ok: false, status: 401, code: "stale", message: "Timestamp outside the accepted window" };

  const r = await store.recordHeartbeat({
    deviceId: hb.deviceId,
    nonce: hb.nonce,
    deviceTs: new Date(hb.ts * 1000),
    receivedAt: now,
    mains: hb.mains,
    powerSource: hb.powerSource,
    batteryPct: hb.batteryPct ?? null,
    selfTest: hb.selfTest ?? null,
    firmware: hb.firmware ?? null,
    clockSkewS: skew,
    networkHash,
    minIntervalSeconds: SENSOR_CONFIG.minIntervalSeconds,
  });
  if (r === "replay") return { ok: false, status: 409, code: "replay", message: "Nonce already used" };
  if (r === "rate_limited") return { ok: false, status: 429, code: "rate_limited", message: `At most one heartbeat every ${SENSOR_CONFIG.minIntervalSeconds} s` };
  return { ok: true };
}
