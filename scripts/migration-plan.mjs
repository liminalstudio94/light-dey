// Decides which migration files to apply and in what order (pure; unit-tested).
// Rule: schema migrations first, in name order; then EVERY seed that is new or changed, in name order.
// Seeds are idempotent upserts generated from code and may use any schema feature, so they always
// run after all schema migrations — on a fresh database and on an existing one.
/**
 * @template {{ name: string, checksum: string }} F
 * @param {F[]} files
 * @param {Map<string, string|null>} done
 * @returns {{ steps: (F & { action: "apply" | "reseed" })[], skipped: string[] }}
 */
export function planMigrations(files, done) {
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
  const isSeed = (f) => /_seed_/.test(f.name);
  const schema = sorted.filter((f) => !isSeed(f) && !done.has(f.name)).map((f) => ({ ...f, action: "apply" }));
  const seeds = sorted.filter((f) => isSeed(f) && done.get(f.name) !== f.checksum).map((f) => ({ ...f, action: done.has(f.name) ? "reseed" : "apply" }));
  const skipped = sorted.filter((f) => !schema.some((x) => x.name === f.name) && !seeds.some((x) => x.name === f.name)).map((f) => f.name);
  return { steps: [...schema, ...seeds], skipped };
}
