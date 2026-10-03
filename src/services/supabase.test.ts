import { describe, expect, it, vi } from "vitest";

// supabase.ts is server-only; stub that guard so the pure helper can be imported.
vi.mock("server-only", () => ({}));

const { isTransientDbError } = await import("./supabase");

describe("isTransientDbError", () => {
  it("recognises dead-socket and pooler errors, including wrapped causes", () => {
    expect(isTransientDbError(Object.assign(new Error("x"), { code: "CONNECTION_CLOSED" }))).toBe(true);
    expect(isTransientDbError(new Error("DB_TIMEOUT: query took too long"))).toBe(true);
    expect(isTransientDbError(new Error("Failed query", { cause: Object.assign(new Error("read"), { code: "ECONNRESET" }) }))).toBe(true);
  });

  it("does not retry real query errors", () => {
    expect(isTransientDbError(Object.assign(new Error("duplicate key"), { code: "23505" }))).toBe(false);
    expect(isTransientDbError(undefined)).toBe(false);
  });
});
