import "server-only";
import { MemoryStore } from "./memory";
import { SupabaseStore } from "./supabase";
import type { DataStore } from "./types";

const g = globalThis as unknown as { __lightDeyStore?: DataStore };

/** Supabase when configured; otherwise an empty in-memory store (dev only). */
export function getStore(): DataStore {
  if (g.__lightDeyStore) return g.__lightDeyStore;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (url && key) g.__lightDeyStore = new SupabaseStore(url, key);
  else {
    if (process.env.NODE_ENV === "production" && process.env.LIGHTDEY_ALLOW_MEMORY_STORE !== "1") {
      throw new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY (see .env.example).");
    }
    g.__lightDeyStore = new MemoryStore();
  }
  return g.__lightDeyStore;
}
