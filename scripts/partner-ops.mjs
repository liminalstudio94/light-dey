// Partner key operations as plain SQL over an `exec(text, params) => rows` adapter, so the exact
// statements run by scripts/partner-key.mjs are unit-tested against an empty Postgres (PGlite).

/** Latest-writer rule: a claim belongs to the key that most recently wrote it (its last partner_ingested event). */
const CLAIMS_OF_KEY = `
  with latest as (
    select distinct on (e.observation_id) e.observation_id, e.actor
    from lightdey.verification_events e
    where e.event = 'partner_ingested' and e.observation_id is not null
    order by e.observation_id, e.id desc
  )
  select o.id from lightdey.observations o join latest l on l.observation_id = o.id
  where l.actor = $1 and o.withdrawn_at is null`;

/** @param {Exec} exec @param {string[]} ids @param {string} note */
async function withdraw(exec, ids, note) {
  for (const id of ids) {
    await exec(`update lightdey.observations set withdrawn_at = now() where id = $1 and withdrawn_at is null`, [id]);
    await exec(`insert into lightdey.verification_events (observation_id, event, actor, note) values ($1, 'removed', 'operator', $2)`, [id, note]);
  }
}

/** Revokes one key and withdraws only the claims it was the latest to write (peers' updates survive). */
/** @param {Exec} exec @param {string} keyId */
export async function revokeKey(exec, keyId) {
  const [k] = await exec(`update lightdey.partner_keys set revoked_at = now() where id = $1 and revoked_at is null returning id, source_id`, [keyId]);
  if (!k) return null;
  const claims = await exec(CLAIMS_OF_KEY, [`key:${k.id}`]);
  await withdraw(exec, claims.map((c) => c.id), `key revoked: ${k.id}`);
  return { source: k.source_id, withdrawn: claims.length };
}

/** Switches a partner off: source inactive, EVERY key revoked, all its live claims withdrawn. */
/** @param {Exec} exec @param {string} sourceId */
export async function deactivateSource(exec, sourceId) {
  const [s] = await exec(`update lightdey.sources set is_active = false where id = $1 and id ~ '^(partner|verified):' returning id`, [sourceId]);
  if (!s) return null;
  const keys = await exec(`update lightdey.partner_keys set revoked_at = now() where source_id = $1 and revoked_at is null returning id`, [s.id]);
  const claims = await exec(`select id from lightdey.observations where source_id = $1 and withdrawn_at is null`, [s.id]);
  await withdraw(exec, claims.map((c) => c.id), "source deactivated");
  return { keysRevoked: keys.length, withdrawn: claims.length };
}

/** @typedef {(text: string, params?: unknown[]) => Promise<Record<string, any>[]>} Exec */

/**
 * Creates/updates the source for a new key. An INACTIVE source is only reactivated with
 * `reactivate: true`; its old keys stay revoked either way (deactivation revoked them).
 */
/**
 * @param {Exec} exec
 * @param {{ id: string, name: string, kind: string, tier: number, coverage: string, reactivate?: boolean }} spec
 */
export async function upsertSourceForKey(exec, { id, name, kind, tier, coverage, reactivate }) {
  const [existing] = await exec(`select is_active from lightdey.sources where id = $1`, [id]);
  if (existing && !existing.is_active && !reactivate) throw new Error(`${id} was deactivated; pass --reactivate to issue a new key (old keys stay revoked)`);
  await exec(
    `insert into lightdey.sources (id, name, kind, trust_tier, coverage, credentials_required, is_active, notes)
     values ($1, $2, $3, $4, $5, true, true, 'Approved via scripts/partner-key.mjs')
     on conflict (id) do update set name = excluded.name, kind = excluded.kind, trust_tier = excluded.trust_tier, coverage = excluded.coverage, is_active = true`,
    [id, name, kind, tier, coverage],
  );
}
