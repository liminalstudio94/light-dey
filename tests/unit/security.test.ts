import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AREAS } from "@/lib/areas";
import { DISCO_AREAS } from "@/lib/sources/discos";
import { SOURCES } from "@/lib/sources/registry";

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
      expect(code, f).not.toMatch(/SUPABASE_SECRET_KEY|SERVICE_ROLE|REPORTER_HASH_SECRET|POSTGRES_URL/);
      expect(code, f).not.toMatch(/lib\/store|lib\/server\/(identity|data)"/);
    }
  });
  it("server-only modules are guarded", () => {
    for (const f of ["src/lib/store/index.ts", "src/lib/store/postgres.ts", "src/lib/server/identity.ts", "src/lib/server/data.ts"]) {
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
    const tables = [...sql.matchAll(/create table lightdey\.(\w+)/g)].map((m) => m[1]);
    expect(tables.length).toBeGreaterThanOrEqual(22);
    for (const t of tables) expect(sql).toContain(`alter table lightdey.${t} enable row level security`);
  });
  it("keeps everything inside the lightdey schema (shared database)", () => {
    expect(sql).not.toMatch(/\bpublic\.\w+/);
    expect(sql).not.toMatch(/on auth\.users/);
    expect(sql).toContain("revoke all on all tables in schema lightdey from anon, authenticated");
  });
  it("gives no write policy on reports to public keys", () => {
    expect(sql).not.toMatch(/on lightdey\.electricity_reports for (insert|update|delete|all)/);
  });
  it("seed matches src/lib/areas.ts", () => {
    for (const a of AREAS) expect(sql).toContain(`('${a.id}', '${a.name.replace(/'/g, "''")}'`);
  });
  it("seeds every registry source and DisCo mapping", () => {
    for (const s of SOURCES) expect(sql).toContain(`('${s.id}', `);
    for (const d of DISCO_AREAS) expect(sql).toContain(`('${d.areaId}', '${d.disco}'`);
  });
  it("only stores hashes of partner keys", () => {
    expect(sql).toMatch(/key_hash text not null unique check \(char_length\(key_hash\) = 64\)/);
  });
});

describe("source registry", () => {
  it("only marks sources active when they are live or derived", () => {
    for (const s of SOURCES) if (s.active) expect(["live", "derived"], s.id).toContain(s.integration);
  });
  // Yaba stays unmapped until an official source names its DisCo; update this test with the citation if that changes.
  it("DisCo mappings cite an official source and never include Yaba", () => {
    for (const d of DISCO_AREAS) expect(d.sourceUrl).toMatch(/^https:\/\//);
    expect(DISCO_AREAS.map((d) => d.areaId)).not.toContain("yaba");
  });
});
