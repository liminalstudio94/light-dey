/**
 * Cheap, in-process protection for the public heartbeat endpoint, applied BEFORE any database
 * lookup: a per-network token bucket and a short negative cache of unknown device ids.
 * Per server instance (serverless); the platform firewall rate limit is the global backstop (SECURITY.md).
 */
const BUCKET_CAPACITY = 30; // requests
const REFILL_PER_SEC = 0.5; // ~30/min sustained per network
const UNKNOWN_TTL_MS = 5 * 60_000;
const MAX_ENTRIES = 10_000;

const buckets = new Map<string, { tokens: number; at: number }>();
const unknownIds = new Map<string, number>();

function trim<K, V>(m: Map<K, V>) {
  if (m.size > MAX_ENTRIES) for (const k of [...m.keys()].slice(0, m.size - MAX_ENTRIES)) m.delete(k);
}

export function allowNetwork(networkHash: string, now = Date.now()): boolean {
  const b = buckets.get(networkHash) ?? { tokens: BUCKET_CAPACITY, at: now };
  b.tokens = Math.min(BUCKET_CAPACITY, b.tokens + ((now - b.at) / 1000) * REFILL_PER_SEC);
  b.at = now;
  buckets.delete(networkHash);
  buckets.set(networkHash, b); // LRU order
  trim(buckets);
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

export function isKnownUnknown(deviceId: string, now = Date.now()): boolean {
  const t = unknownIds.get(deviceId);
  if (t === undefined) return false;
  if (now - t > UNKNOWN_TTL_MS) {
    unknownIds.delete(deviceId);
    return false;
  }
  return true;
}

export function rememberUnknown(deviceId: string, now = Date.now()) {
  unknownIds.set(deviceId, now);
  trim(unknownIds);
}

/** Test helper. */
export function resetGuard() {
  buckets.clear();
  unknownIds.clear();
}

/** Reads at most `max` bytes; returns null (and cancels the stream) as soon as the budget is exceeded. */
export async function readBodyLimited(body: ReadableStream<Uint8Array> | null, max: number): Promise<string | null> {
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
