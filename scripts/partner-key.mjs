// Approves a partner or verified reporter and issues an API key (shown ONCE).
// Usage:
//   node --env-file=.env.local scripts/partner-key.mjs --id partner:acme-estate --name "Acme Estate facilities" \
//     --kind verified_partner --tier 1 --coverage "Acme Estate, Lekki Phase 1"
//   node --env-file=.env.local scripts/partner-key.mjs --revoke <key-id>
import { createHash, randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import postgres from "postgres";

const { values: a } = parseArgs({ options: { id: { type: "string" }, name: { type: "string" }, kind: { type: "string" }, tier: { type: "string" }, coverage: { type: "string" }, revoke: { type: "string" } } });
const sql = postgres(process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL, { ssl: "require", prepare: false, max: 1 });
try {
  if (a.revoke) {
    const r = await sql`update lightdey.partner_keys set revoked_at = now() where id = ${a.revoke} and revoked_at is null returning id`;
    console.log(r.length ? `Revoked ${a.revoke}` : "No active key with that id");
  } else {
    if (!a.id || !/^(partner|verified):[a-z0-9-]{3,40}$/.test(a.id)) throw new Error("--id must look like partner:<slug> or verified:<slug>");
    if (!["verified_partner", "verified_reporter", "official_disco"].includes(a.kind ?? "")) throw new Error("--kind must be verified_partner, verified_reporter or official_disco");
    const tier = Number(a.tier);
    if (![1, 2].includes(tier)) throw new Error("--tier must be 1 (official/approved operator) or 2 (verified reporter)");
    if (!a.name || !a.coverage) throw new Error("--name and --coverage are required");
    await sql`insert into lightdey.sources (id, name, kind, trust_tier, coverage, credentials_required, is_active, notes)
              values (${a.id}, ${a.name}, ${a.kind}, ${tier}, ${a.coverage}, true, true, 'Approved via scripts/partner-key.mjs')
              on conflict (id) do update set name = excluded.name, kind = excluded.kind, trust_tier = excluded.trust_tier, coverage = excluded.coverage, is_active = true`;
    const key = `ldp_${randomBytes(24).toString("base64url")}`;
    const [row] = await sql`insert into lightdey.partner_keys (source_id, key_hash, label) values (${a.id}, ${createHash("sha256").update(key).digest("hex")}, ${a.name}) returning id`;
    console.log(`Source ${a.id} (tier ${tier}) active.\nKey id: ${row.id}\nAPI key (store it now — it is not saved anywhere): ${key}`);
  }
} finally {
  await sql.end();
}
