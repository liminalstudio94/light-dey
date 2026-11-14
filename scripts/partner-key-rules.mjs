// Validation for scripts/partner-key.mjs, kept separate so it is unit-tested.
// Trust tier is DERIVED from the id prefix and kind — never chosen freely — so a single
// verified reporter can never be issued official (tier 1) authority.
export const KINDS_BY_PREFIX = {
  "verified:": { kinds: ["verified_reporter"], tier: () => 2 },
  // Human partners (shops, security desks, estates…) are reports (tier 2); only an official DisCo partner is tier 1.
  "partner:": { kinds: ["verified_partner", "official_disco"], tier: (kind) => (kind === "official_disco" ? 1 : 2) },
};

/**
 * Returns { tier } or throws with a clear message. `tier`, if given, must match the derived one.
 * @param {{ id?: string, kind?: string, tier?: string | number | null }} spec
 * @returns {{ tier: number }}
 */
export function validateSourceSpec({ id, kind, tier }) {
  if (!id || !/^(partner|verified):[a-z0-9-]{3,40}$/.test(id)) throw new Error("--id must look like partner:<slug> or verified:<slug>");
  const prefix = id.startsWith("verified:") ? "verified:" : "partner:";
  const rule = KINDS_BY_PREFIX[prefix];
  if (!rule.kinds.includes(kind)) throw new Error(`--kind for ${prefix} ids must be ${rule.kinds.join(" or ")}`);
  const derived = rule.tier(kind);
  if (tier !== undefined && tier !== null && tier !== "" && Number(tier) !== derived) {
    throw new Error(`${prefix} ${kind} sources are always tier ${derived}; got --tier ${tier}`);
  }
  return { tier: derived };
}
