import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AREAS } from "@/lib/areas";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const src = walk("src").filter((f) => /\.(ts|tsx)$/.test(f));

describe("credential exposure", () => {
  it("client components never reference server secrets", () => {
    for (const f of src) {
      const code = readFileSync(f, "utf8");
      if (!code.startsWith('"use client"')) continue;
      expect(code, f).not.toMatch(/SUPABASE_SECRET_KEY|SERVICE_ROLE|REPORTER_HASH_SECRET/);
      expect(code, f).not.toMatch(/lib\/store|lib\/server\/(identity|data)"/);
    }
  });
  it("server-only modules are guarded", () => {
    for (const f of ["src/lib/store/index.ts", "src/lib/store/supabase.ts", "src/lib/server/identity.ts", "src/lib/server/data.ts"]) {
      expect(readFileSync(f, "utf8"), f).toMatch(/import "server-only"/);
    }
  });
  it("no secrets are hardcoded", () => {
    for (const f of src) expect(readFileSync(f, "utf8"), f).not.toMatch(/sb_secret_[A-Za-z0-9]|eyJhbGciOi/);
  });
});

describe("database migrations", () => {
  const sql = readdirSync("supabase/migrations").map((f) => readFileSync(join("supabase/migrations", f), "utf8")).join("\n");
  it("enables RLS on every table", () => {
    const tables = [...sql.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]);
    expect(tables.length).toBe(13);
    for (const t of tables) expect(sql).toContain(`alter table public.${t} enable row level security`);
  });
  it("gives no write policy on reports to public keys", () => {
    expect(sql).not.toMatch(/on public\.electricity_reports for (insert|update|delete|all)/);
  });
  it("seed matches src/lib/areas.ts", () => {
    for (const a of AREAS) expect(sql).toContain(`('${a.id}', '${a.name.replace(/'/g, "''")}'`);
  });
});
