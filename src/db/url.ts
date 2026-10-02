// Builds Supabase pooler connection strings from the project URL, DB password and region,
// so only SUPABASE_* settings are needed. Pure: used by the app and by drizzle.config.ts.

export type DbUrlInput = {
  supabaseUrl?: string;
  password?: string;
  region?: string;
  /** Optional full override, e.g. a non-Supabase Postgres. */
  databaseUrl?: string;
};

/**
 * mode "transaction" → port 6543 (app queries, serverless friendly)
 * mode "session"     → port 5432 (migrations)
 * Both go through the IPv4 pooler, which Vercel can reach.
 */
export function supabaseDbUrl(input: DbUrlInput, mode: "transaction" | "session" = "transaction"): string {
  if (input.databaseUrl) return input.databaseUrl;
  const { supabaseUrl, password, region } = input;
  if (!supabaseUrl || !password || !region) {
    throw new Error("Set SUPABASE_URL, SUPABASE_DB_PASSWORD and SUPABASE_REGION (or DATABASE_URL).");
  }
  const ref = new URL(supabaseUrl).hostname.split(".")[0];
  // Accept "ap-northeast-1" (→ aws-0-…) or the full prefix shown in the dashboard, e.g. "aws-1-ap-northeast-1".
  const host = /^aws-\d+-/.test(region) ? `${region}.pooler.supabase.com` : `aws-0-${region}.pooler.supabase.com`;
  const port = mode === "transaction" ? 6543 : 5432;
  return `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${host}:${port}/postgres`;
}
