import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";
import { supabaseDbUrl } from "./url";

type DB = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as { __easymailDb?: DB };

export function db(): DB {
  if (!globalForDb.__easymailDb) {
    const e = env();
    const url = supabaseDbUrl({
      supabaseUrl: e.SUPABASE_URL,
      password: e.SUPABASE_DB_PASSWORD,
      region: e.SUPABASE_REGION,
      databaseUrl: e.DATABASE_URL,
    });
    // prepare: false is required for Supabase's transaction pooler (port 6543).
    // Pages fire ~10 queries at once; a small pool serialises them into extra round trips.
    // Connections stay open for good (opening one costs ~1s to Tokyo). TCP keep-alive probes every
    // 10s stop routers/NAT from silently dropping an idle socket, which otherwise hangs the next
    // query until the 2 min statement timeout.
    const client = postgres(url, {
      prepare: false,
      max: Number(process.env.DATABASE_POOL_MAX) || 8,
      idle_timeout: 0,
      connect_timeout: 10,
      keep_alive: 10,
    });
    globalForDb.__easymailDb = drizzle(client, { schema });
  }
  return globalForDb.__easymailDb;
}

export * from "./schema";
