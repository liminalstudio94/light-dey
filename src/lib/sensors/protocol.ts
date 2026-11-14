import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Light Dey Sensor protocol v1 (full spec: SENSORS.md).
 *
 *   POST /api/sensors/heartbeat
 *   X-LightDey-Signature: v1=<hex HMAC-SHA256(deviceSecret, rawBody)>
 *   { "v": 1, "deviceId": "ldd_…", "ts": <unix seconds>, "nonce": "<16-64 url-safe chars>",
 *     "mains": "on"|"off"|"unknown", "powerSource": "grid"|"generator"|"inverter"|"solar"|"ups"|"battery"|"unknown",
 *     "batteryPct"?: 0-100, "uptimeS"?: int, "firmware"?: string, "selfTest"?: "pass"|"fail" }
 *
 * deviceSecret = base64url(HMAC-SHA256(SENSOR_MASTER_SECRET, "lightdey-device:v1:" + deviceId)).
 * The server re-derives it, so per-device secrets are never stored. Rotating = issuing a new deviceId.
 */
export const DEVICE_ID_RE = /^ldd_[A-Za-z0-9]{16,40}$/;
export const MAX_BODY_BYTES = 2048;

export const heartbeatSchema = z.object({
  v: z.literal(1),
  deviceId: z.string().regex(DEVICE_ID_RE),
  ts: z.number().int().positive(),
  nonce: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  mains: z.enum(["on", "off", "unknown"]),
  powerSource: z.enum(["grid", "generator", "inverter", "solar", "ups", "battery", "unknown"]),
  batteryPct: z.number().min(0).max(100).optional(),
  uptimeS: z.number().int().min(0).max(10 * 365 * 86400).optional(),
  firmware: z.string().max(32).regex(/^[\w.+-]*$/).optional(),
  selfTest: z.enum(["pass", "fail"]).optional(),
});
export type Heartbeat = z.infer<typeof heartbeatSchema>;

function masterSecret(): string {
  const s = process.env.SENSOR_MASTER_SECRET;
  if (!s || s.length < 32) throw new Error("SENSOR_MASTER_SECRET is not set (min 32 chars)");
  return s;
}

export function deviceSecret(deviceId: string, master = masterSecret()): string {
  return createHmac("sha256", master).update(`lightdey-device:v1:${deviceId}`).digest("base64url");
}

export function signBody(rawBody: string, secret: string): string {
  return `v1=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

export function verifySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !/^v1=[0-9a-f]{64}$/.test(header)) return false;
  const want = Buffer.from(signBody(rawBody, secret));
  const have = Buffer.from(header);
  return want.length === have.length && timingSafeEqual(want, have);
}
