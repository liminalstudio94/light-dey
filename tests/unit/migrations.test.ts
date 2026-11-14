import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { planMigrations } from "../../scripts/migration-plan.mjs";
import { AREAS } from "@/lib/areas";
import { SOURCES } from "@/lib/sources/registry";

const DIR = "supabase/migrations";
const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((name) => {
    const body = readFileSync(`${DIR}/${name}`, "utf8");
    return { name, body, checksum: createHash("sha256").update(body).digest("hex") };
  });

/** Minimal stand-ins for what Supabase provides (auth schema, API roles). */
const SUPABASE_STUBS = `
  create role anon; create role authenticated;
  create schema auth; create schema extensions;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
`;

async function migrateFresh() {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  await db.exec("create schema lightdey; create table lightdey.schema_migrations (name text primary key, checksum text, applied_at timestamptz default now());");
  const { steps } = planMigrations(files, new Map());
  for (const st of steps) {
    await db.transaction(async (tx) => {
      await tx.exec(st.body);
      await tx.query("insert into lightdey.schema_migrations (name, checksum) values ($1, $2)", [st.name, st.checksum]);
    });
  }
  return { db, steps };
}

describe("migration plan", () => {
  it("runs every seed after every schema migration, new or changed", () => {
    const f = (name: string, checksum = "x") => ({ name, checksum });
    const plan = planMigrations([f("1_init.sql"), f("2_seed_a.sql"), f("3_evidence.sql"), f("4_seed_b.sql"), f("5_sensors.sql")], new Map());
    expect(plan.steps.map((s) => s.name)).toEqual(["1_init.sql", "3_evidence.sql", "5_sensors.sql", "2_seed_a.sql", "4_seed_b.sql"]);
    const again = planMigrations([f("1_init.sql"), f("2_seed_a.sql", "changed"), f("6_new.sql")], new Map([["1_init.sql", "x"], ["2_seed_a.sql", "x"]]));
    expect(again.steps.map((s) => `${s.action}:${s.name}`)).toEqual(["apply:6_new.sql", "reseed:2_seed_a.sql"]);
    expect(again.skipped).toEqual(["1_init.sql"]);
  });
});

describe("migrations on an EMPTY database (PGlite)", () => {
  it("apply cleanly end to end, with seeds last (Qodo pass 4, #5-1)", async () => {
    const { db, steps } = await migrateFresh();
    expect(steps.length).toBe(files.length);
    const n = async (sql: string) => Number(((await db.query<{ n: number }>(sql)).rows[0]).n);
    expect(await n("select count(*) as n from lightdey.neighbourhoods")).toBe(AREAS.length);
    expect(await n("select count(*) as n from lightdey.sources")).toBe(SOURCES.length);
    expect(await n("select count(*) as n from lightdey.sources where kind in ('telemetry','proxy','device_provider')")).toBeGreaterThan(0);
    expect(await n("select count(*) as n from lightdey.disco_service_areas")).toBe(11);
    // every table has RLS
    expect(await n("select count(*) as n from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'lightdey' and c.relkind = 'r' and not c.relrowsecurity and c.relname <> 'schema_migrations'")).toBe(0);
    // re-running the plan on the migrated DB does nothing
    const done = new Map((await db.query<{ name: string; checksum: string }>("select name, checksum from lightdey.schema_migrations")).rows.map((r) => [r.name, r.checksum]));
    expect(planMigrations(files, done).steps).toEqual([]);
    await db.close();
  }, 60_000);
});
