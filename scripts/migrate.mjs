// Applies supabase/migrations/*.sql in order, once each, tracked in lightdey.schema_migrations.
// Usage: node --env-file=.env.local scripts/migrate.mjs [--dry-run]
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
  const done = new Set((await sql`select name from lightdey.schema_migrations`).map((r) => r.name));
  for (const f of files) {
    if (done.has(f)) {
      console.log(`skip   ${f}`);
      continue;
    }
    if (dry) {
      console.log(`would apply ${f}`);
      continue;
    }
    const body = readFileSync(new URL(f, dir), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into lightdey.schema_migrations (name) values (${f})`;
    });
    console.log(`apply  ${f}`);
  }
} finally {
  await sql.end();
}
