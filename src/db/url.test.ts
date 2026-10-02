import { describe, expect, it } from "vitest";
import { supabaseDbUrl } from "./url";

const base = { supabaseUrl: "https://abcxyz.supabase.co", password: "p@ss#word", region: "ap-northeast-1" };

describe("supabaseDbUrl", () => {
  it("builds the transaction pooler URL and encodes the password", () => {
    expect(supabaseDbUrl(base)).toBe("postgresql://postgres.abcxyz:p%40ss%23word@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres");
  });
  it("uses port 5432 for session mode", () => {
    expect(supabaseDbUrl(base, "session")).toContain(".pooler.supabase.com:5432/");
  });
  it("accepts a full aws-N prefix", () => {
    expect(supabaseDbUrl({ ...base, region: "aws-1-us-east-1" })).toContain("@aws-1-us-east-1.pooler.supabase.com:6543");
  });
  it("prefers an explicit DATABASE_URL", () => {
    expect(supabaseDbUrl({ databaseUrl: "postgres://x@h/db" })).toBe("postgres://x@h/db");
  });
  it("explains what is missing", () => {
    expect(() => supabaseDbUrl({ supabaseUrl: base.supabaseUrl })).toThrow(/SUPABASE_DB_PASSWORD/);
  });
});
