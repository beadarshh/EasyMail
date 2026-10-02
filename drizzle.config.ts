import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { supabaseDbUrl } from "./src/db/url";

config({ path: ".env.local", quiet: true });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Session-mode pooler (port 5432) supports the statements migrations need.
    url: supabaseDbUrl(
      {
        supabaseUrl: process.env.SUPABASE_URL,
        password: process.env.SUPABASE_DB_PASSWORD,
        region: process.env.SUPABASE_REGION,
        databaseUrl: process.env.DATABASE_URL || undefined,
      },
      "session",
    ),
  },
});
