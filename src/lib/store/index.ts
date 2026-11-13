import "server-only";
import { MemoryStore } from "./memory";
import { PostgresStore } from "./postgres";
import type { DataStore } from "./types";

const g = globalThis as unknown as { __lightDeyStore?: DataStore };

/** Supabase Postgres when POSTGRES_URL is set; otherwise an empty in-memory store (dev only). */
export function getStore(): DataStore {
  if (g.__lightDeyStore) return g.__lightDeyStore;
  const url = process.env.POSTGRES_URL;
  if (url && process.env.LIGHTDEY_FORCE_MEMORY_STORE !== "1") g.__lightDeyStore = new PostgresStore(url);
  else {
    if (process.env.NODE_ENV === "production" && process.env.LIGHTDEY_ALLOW_MEMORY_STORE !== "1") {
      throw new Error("Database is not configured. Set POSTGRES_URL (see .env.example).");
    }
    g.__lightDeyStore = new MemoryStore();
  }
  return g.__lightDeyStore;
}
