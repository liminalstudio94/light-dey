// Applies supabase/migrations/*.sql in order, once each, tracked in lightdey.schema_migrations.
// Files named *_seed_*.sql are idempotent upserts generated from code; they run after all schema
// migrations and are re-applied whenever their content changes (tracked by checksum). See migration-plan.mjs.
// Usage: node --env-file=.env.local scripts/migrate.mjs [--dry-run]
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import postgres from "postgres";
import { planMigrations } from "./migration-plan.mjs";

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
  const all = files.map((f) => {
    const body = readFileSync(new URL(f, dir), "utf8");
    return { name: f, body, checksum: createHash("sha256").update(body).digest("hex") };
  });
  const { steps, skipped } = planMigrations(all, done);
  for (const f of skipped) console.log(`skip   ${f}`);
  for (const st of steps) {
    if (dry) {
      console.log(`would ${st.action} ${st.name}`);
      continue;
    }
    await sql.begin(async (tx) => {
      await tx.unsafe(st.body);
      await tx`insert into lightdey.schema_migrations (name, checksum) values (${st.name}, ${st.checksum})
               on conflict (name) do update set checksum = excluded.checksum, applied_at = now()`;
    });
    console.log(`${st.action.padEnd(6)} ${st.name}`);
  }
} finally {
  await sql.end();
}
