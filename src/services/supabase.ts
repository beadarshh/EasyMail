import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { supabaseDbUrl } from "@/db/url";
import { env, storageKey } from "@/lib/env";

// The one place that opens connections to Supabase: Postgres (via the pooler) and the JS client (Storage).
// Every other *.service.ts file goes through db() / supabase() from here.

type DB = ReturnType<typeof drizzle<typeof schema>>;
type Pool = ReturnType<typeof postgres>;

const g = globalThis as unknown as { __easymailPool?: Pool; __easymailDb?: DB; __easymailSupabase?: SupabaseClient };

export function db(): DB {
  if (!g.__easymailDb) {
    const e = env();
    const url = supabaseDbUrl({
      supabaseUrl: e.SUPABASE_URL,
      password: e.SUPABASE_DB_PASSWORD,
      region: e.SUPABASE_REGION,
      databaseUrl: e.DATABASE_URL,
    });
    // prepare: false is required for Supabase's transaction pooler (port 6543).
    // Pages fire ~10 queries at once; a small pool serialises them into extra round trips.
    // idle_timeout / max_lifetime recycle sockets before a frozen serverless instance leaves a dead one
    // behind, and keep_alive probes stop NAT routers from silently dropping a live one.
    g.__easymailPool = postgres(url, {
      prepare: false,
      max: Number(process.env.DATABASE_POOL_MAX) || 8,
      idle_timeout: 30,
      max_lifetime: 60 * 30,
      connect_timeout: 10,
      keep_alive: 10,
    });
    g.__easymailDb = drizzle(g.__easymailPool, { schema });
  }
  return g.__easymailDb;
}

/** Drops the pool so the next db() call opens fresh connections. */
async function resetDb() {
  const pool = g.__easymailPool;
  g.__easymailPool = undefined;
  g.__easymailDb = undefined;
  await pool?.end({ timeout: 1 }).catch(() => {});
}

export function supabase(): SupabaseClient {
  if (!g.__easymailSupabase) {
    const e = env();
    g.__easymailSupabase = createClient(e.SUPABASE_URL!, storageKey()!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return g.__easymailSupabase;
}

// ─── Resilience for reads ────────────────────────────────────────────────

const TRANSIENT = /CONNECT_TIMEOUT|CONNECTION_(CLOSED|ENDED|DESTROYED)|ECONNRESET|ECONNREFUSED|EPIPE|ETIMEDOUT|DB_TIMEOUT|terminating connection|too many clients|max client connections/i;

/** True for connection-level failures (dead socket, pooler hiccup) that a fresh connection can fix. */
export function isTransientDbError(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e && depth < 4; depth++) {
    const x = e as { code?: string; message?: string; cause?: unknown };
    if (TRANSIENT.test(`${x.code ?? ""} ${x.message ?? ""}`)) return true;
    e = x.cause;
  }
  return false;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("DB_TIMEOUT: query took too long")), ms);
  });
  return Promise.race([p, limit]).finally(() => clearTimeout(timer));
}

/**
 * Runs an idempotent read with a time limit. If the connection turns out to be dead
 * (it hangs or errors), the pool is replaced and the read is tried once more.
 * Use for reads only: a retried write could run twice.
 */
export async function readDb<T>(fn: () => Promise<T>, timeoutMs = 15_000): Promise<T> {
  try {
    return await withTimeout(fn(), timeoutMs);
  } catch (err) {
    if (!isTransientDbError(err)) throw err;
    console.warn("[db] transient error, reconnecting and retrying once:", (err as Error).message);
    await resetDb();
    return withTimeout(fn(), timeoutMs);
  }
}
