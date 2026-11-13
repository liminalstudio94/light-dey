// Applies supabase/migrations/*.sql in order, once each, tracked in lightdey.schema_migrations.
// Files named *_seed_*.sql are idempotent upserts generated from code; they are
// re-applied whenever their content changes (tracked by checksum).
// Usage: node --env-file=.env.local scripts/migrate.mjs [--dry-run]
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;
if (!url) throw new Error("POSTGRES_URL_NON_POOLING or POSTGRES_URL is required");
const dry = process.argv.includes("--dry-run");
const dir = new URL("../supabase/migrations/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const sql = postgres(url, { ssl: "require", prepare: false, max: 1, onnotice: () => {} });

try {
  await sql`create schema if not exists lightdey`;
  await sql`create table if not exists lightdey.schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  await sql`alter table lightdey.schema_migrations enable row level security`;
  await sql`alter table lightdey.schema_migrations add column if not exists checksum text`;
  const done = new Map((await sql`select name, checksum from lightdey.schema_migrations`).map((r) => [r.name, r.checksum]));
  for (const f of files) {
    const body = readFileSync(new URL(f, dir), "utf8");
    const checksum = createHash("sha256").update(body).digest("hex");
    const isSeed = /_seed_/.test(f);
    if (done.has(f) && (!isSeed || done.get(f) === checksum)) {
      console.log(`skip   ${f}`);
      continue;
    }
    if (dry) {
      console.log(`would apply ${f}`);
      continue;
    }
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into lightdey.schema_migrations (name, checksum) values (${f}, ${checksum})
               on conflict (name) do update set checksum = excluded.checksum, applied_at = now()`;
    });
    console.log(`${done.has(f) ? "reseed" : "apply "} ${f}`);
  }
} finally {
  await sql.end();
}
