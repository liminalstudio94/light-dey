import { createHash } from "node:crypto";
import { z } from "zod";
import { getArea } from "./areas";
import { EVIDENCE_CONFIG } from "./config";
import type { DataStore } from "./store/types";

export const PARTNER_RATE_LIMIT_PER_HOUR = 120;

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

export const partnerObservationSchema = z.object({
  neighbourhoodId: z.string().refine((id) => !!getArea(id), "Unknown neighbourhood"),
  status: z.enum(["on", "off"]),
  observedAt: z.iso.datetime({ offset: true }),
  externalId: z.string().min(1).max(120).regex(/^[\w:.-]+$/, "externalId may contain letters, digits, _ : . -"),
  note: z.string().max(200).optional(),
});

export type PartnerResult = { ok: true; written: boolean } | { ok: false; status: number; code: string; message: string };

/** Authenticated ingestion for approved partners / verified reporters. Idempotent on externalId. */
export async function ingestPartnerObservation(store: DataStore, authHeader: string | null, body: unknown, now: Date = new Date()): Promise<PartnerResult> {
  const key = authHeader?.match(/^Bearer\s+(\S{24,200})$/)?.[1];
  if (!key) return { ok: false, status: 401, code: "unauthorized", message: "Missing or malformed API key" };
  const partner = await store.findPartnerKey(hashKey(key));
  if (!partner) return { ok: false, status: 401, code: "unauthorized", message: "Unknown, revoked or inactive API key" };

  const parsed = partnerObservationSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, code: "invalid", message: parsed.error.issues[0]?.message ?? "Invalid body" };
  const o = parsed.data;
  const t = Date.parse(o.observedAt);
  if (t > now.getTime() + 2 * 60_000) return { ok: false, status: 400, code: "invalid", message: "observedAt is in the future" };
  if (now.getTime() - t > EVIDENCE_CONFIG.partnerMaxAgeMinutes * 60_000) return { ok: false, status: 400, code: "invalid", message: `observedAt is older than ${EVIDENCE_CONFIG.partnerMaxAgeMinutes} minutes` };

  // Coverage is an authorization boundary, not a description.
  if (!partner.allowedAreas.includes(o.neighbourhoodId)) {
    return { ok: false, status: 403, code: "forbidden_area", message: "This key is not approved for that neighbourhood" };
  }
  // An externalId stays bound to the area it was first filed under.
  const existingArea = await store.observationScope(partner.sourceId, o.externalId);
  if (existingArea !== undefined && existingArea !== o.neighbourhoodId) {
    return { ok: false, status: 409, code: "external_id_conflict", message: "externalId was already used for a different neighbourhood" };
  }
  // Atomic, per key; every accepted attempt counts, including updates to an existing externalId.
  if (!(await store.consumePartnerQuota(partner.keyId, PARTNER_RATE_LIMIT_PER_HOUR, now))) {
    return { ok: false, status: 429, code: "rate_limited", message: "Hourly limit reached for this key" };
  }

  const written = await store.upsertObservations([
    {
      sourceId: partner.sourceId,
      externalId: o.externalId,
      scope: "neighbourhood",
      scopeRef: o.neighbourhoodId,
      kind: "status_report",
      status: o.status,
      valueNum: null,
      title: o.note ?? null,
      url: null,
      observedAt: new Date(t).toISOString(),
      validUntil: new Date(t + EVIDENCE_CONFIG.partnerMaxAgeMinutes * 60_000).toISOString(),
      neighbourhoodIds: [],
    },
  ]);
  if (written) await store.recordVerificationEvent({ sourceId: partner.sourceId, observationExternalId: o.externalId, event: "partner_ingested", actor: `key:${partner.keyId}` });
  return { ok: true, written: written > 0 };
}
