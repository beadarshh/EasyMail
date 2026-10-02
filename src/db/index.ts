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
    const client = postgres(url, { prepare: false, max: Number(process.env.DATABASE_POOL_MAX) || 3 });
    globalForDb.__easymailDb = drizzle(client, { schema });
  }
  return globalForDb.__easymailDb;
}

export * from "./schema";
