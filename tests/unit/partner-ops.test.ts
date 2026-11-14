import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { deactivateSource, revokeKey, upsertSourceForKey } from "../../scripts/partner-ops.mjs";

/** Fresh, fully migrated Postgres (schema migrations first, then seeds), with Supabase stand-ins. */
async function freshDb() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema extensions;
    create table auth.users (id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`);
  const files = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
  for (const f of [...files.filter((x) => !/_seed_/.test(x)), ...files.filter((x) => /_seed_/.test(x))]) await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
  return db;
}

let db: PGlite;
const exec = (text: string, params: unknown[] = []) => db.query(text, params).then((r) => r.rows as Record<string, unknown>[]);
const one = async (text: string, params: unknown[] = []) => (await exec(text, params))[0];

async function partner(id = "partner:acme") {
  await upsertSourceForKey(exec, { id, name: "Acme", kind: "verified_partner", tier: 2, coverage: "test" });
  const key = async (hash: string) => (await one(`insert into lightdey.partner_keys (source_id, key_hash, label, allowed_neighbourhoods) values ($1, $2, 'k', '{epe}') returning id`, [id, hash])).id as string;
  return { k1: await key("1".repeat(64)), k2: await key("2".repeat(64)) };
}
/** A claim written (or last updated) by `keyId`, optionally future-dated. */
async function claim(sourceId: string, ext: string, keyId: string, futureMin = 0) {
  const existing = await one(`select id from lightdey.observations where source_id = $1 and external_id = $2`, [sourceId, ext]);
  const id =
    (existing?.id as string) ??
    ((await one(
      `insert into lightdey.observations (source_id, external_id, scope, scope_ref, kind, status, observed_at, valid_until)
       values ($1, $2, 'neighbourhood', 'epe', 'status_report', 'off', now() + make_interval(mins => $3), now() + make_interval(mins => $3 + 60)) returning id`,
      [sourceId, ext, futureMin],
    )).id as string);
  await exec(`insert into lightdey.verification_events (observation_id, event, actor) values ($1, 'partner_ingested', $2)`, [id, `key:${keyId}`]);
  return id;
}
const live = async (sourceId: string) => Number((await one(`select count(*) n from lightdey.observations where source_id = $1 and withdrawn_at is null`, [sourceId])).n);

describe("partner key operations (exact SQL used by scripts/partner-key.mjs, on an empty Postgres)", () => {
  beforeEach(async () => {
    db = await freshDb();
  }, 60_000);

  it("revoking a key withdraws even FUTURE-dated claims, atomically (Qodo pass 5, #3-1)", async () => {
    const { k1 } = await partner();
    await claim("partner:acme", "future", k1, 2); // allowed: up to 2 min ahead
    await db.transaction(async (tx) => {
      const out = await revokeKey((t: string, p: unknown[] = []) => tx.query(t, p).then((r) => r.rows as Record<string, unknown>[]), k1);
      expect(out).toEqual({ source: "partner:acme", withdrawn: 1 });
    });
    expect(await live("partner:acme")).toBe(0);
    expect((await one(`select revoked_at from lightdey.partner_keys where id = $1`, [k1])).revoked_at).not.toBeNull();
    expect(Number((await one(`select count(*) n from lightdey.verification_events where event = 'removed'`)).n)).toBe(1);
  });

  it("revoking a key withdraws only the claims it was the LAST to write (#3-3)", async () => {
    const { k1, k2 } = await partner();
    await claim("partner:acme", "shared", k1);
    await claim("partner:acme", "shared", k2); // peer key updated it afterwards
    await claim("partner:acme", "mine", k1);
    const out = await revokeKey(exec, k1);
    expect(out?.withdrawn).toBe(1);
    const left = await exec(`select external_id from lightdey.observations where withdrawn_at is null`);
    expect(left.map((r) => r.external_id)).toEqual(["shared"]);
  });

  it("deactivating revokes EVERY key; re-approval needs --reactivate and old keys stay dead (#3-2)", async () => {
    const { k1, k2 } = await partner();
    await claim("partner:acme", "c1", k1);
    const out = await deactivateSource(exec, "partner:acme");
    expect(out).toEqual({ keysRevoked: 2, withdrawn: 1 });
    await expect(upsertSourceForKey(exec, { id: "partner:acme", name: "Acme", kind: "verified_partner", tier: 2, coverage: "test" })).rejects.toThrow(/--reactivate/);
    await upsertSourceForKey(exec, { id: "partner:acme", name: "Acme", kind: "verified_partner", tier: 2, coverage: "test", reactivate: true });
    const stillValid = await exec(`select id from lightdey.partner_keys where id in ($1, $2) and revoked_at is null`, [k1, k2]);
    expect(stillValid).toEqual([]); // the leaked keys never come back
    expect((await one(`select is_active from lightdey.sources where id = 'partner:acme'`)).is_active).toBe(true);
  });

  it("withdrawn claims are excluded from reads regardless of timestamps", async () => {
    const { k1 } = await partner();
    await claim("partner:acme", "x", k1, 1);
    await revokeKey(exec, k1);
    const visible = await exec(`select id from lightdey.observations where withdrawn_at is null and valid_until >= now()`);
    expect(visible).toEqual([]);
  });
});
