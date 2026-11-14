// Approves a partner or verified reporter and issues an API key (shown ONCE).
// Usage:
//   node --env-file=.env.local scripts/partner-key.mjs --id partner:acme-estate --name "Acme Estate facilities" \
//     --kind verified_partner --coverage "Acme Estate, Lekki Phase 1" --areas lekki-phase-1
//   Tier is derived: partner:* => 1, verified:* => 2 (--tier, if given, must match).
//   A verified reporter is ONE person = one source (verified:<slug>) with one active key,
//   so independent reporters are counted separately and a person can't count twice.
//   node --env-file=.env.local scripts/partner-key.mjs --revoke <key-id>
import { createHash, randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import postgres from "postgres";
import { validateSourceSpec } from "./partner-key-rules.mjs";
import { deactivateSource, revokeKey, upsertSourceForKey } from "./partner-ops.mjs";

const { values: a } = parseArgs({ options: { id: { type: "string" }, name: { type: "string" }, kind: { type: "string" }, tier: { type: "string" }, coverage: { type: "string" }, areas: { type: "string" }, revoke: { type: "string" }, deactivate: { type: "string" }, reactivate: { type: "boolean" } } });
const sql = postgres(process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL, { ssl: "require", prepare: false, max: 1 });
try {
  const exec = (tx) => (text, params) => tx.unsafe(text, params);
  if (a.revoke) {
    const out = await sql.begin((tx) => revokeKey(exec(tx), a.revoke));
    console.log(out ? `Revoked ${a.revoke} (${out.source}); withdrew ${out.withdrawn} claim(s) it last wrote.` : "No active key with that id");
  } else if (a.deactivate) {
    const out = await sql.begin((tx) => deactivateSource(exec(tx), a.deactivate));
    console.log(out ? `Deactivated ${a.deactivate}: revoked ${out.keysRevoked} key(s), withdrew ${out.withdrawn} claim(s). Re-approve later with --reactivate (old keys stay revoked).` : "No partner/verified source with that id");
  } else {
    const { tier } = validateSourceSpec({ id: a.id, kind: a.kind, tier: a.tier }); // tier derived from id + kind
    if (!a.name || !a.coverage) throw new Error("--name and --coverage are required");
    const areas = [...new Set((a.areas ?? "").split(",").map((x) => x.trim()).filter(Boolean))];
    if (!areas.length) throw new Error("--areas is required: comma-separated neighbourhood ids this key may report for");
    const known = new Set((await sql`select id from lightdey.neighbourhoods where id in ${sql(areas)}`).map((r) => r.id));
    const unknown = areas.filter((x) => !known.has(x));
    if (unknown.length) throw new Error(`Unknown neighbourhood id(s): ${unknown.join(", ")}`);
    if (a.id.startsWith("verified:") && areas.length > 1) throw new Error("A verified reporter covers one home neighbourhood");
    await sql.begin((tx) => upsertSourceForKey(exec(tx), { id: a.id, name: a.name, kind: a.kind, tier, coverage: a.coverage, reactivate: a.reactivate }));
    if (a.id.startsWith("verified:")) {
      const r = await sql`update lightdey.partner_keys set revoked_at = now() where source_id = ${a.id} and revoked_at is null returning id`;
      if (r.length) console.log(`Revoked ${r.length} previous key(s) for ${a.id} (one active key per verified reporter).`);
    }
    const key = `ldp_${randomBytes(24).toString("base64url")}`;
    const [row] = await sql`insert into lightdey.partner_keys (source_id, key_hash, label, allowed_neighbourhoods) values (${a.id}, ${createHash("sha256").update(key).digest("hex")}, ${a.name}, ${areas}) returning id`;
    console.log(`Source ${a.id} (tier ${tier}) active for: ${areas.join(", ")}.\nKey id: ${row.id}\nAPI key (store it now — it is not saved anywhere): ${key}`);
  }
} finally {
  await sql.end();
}
