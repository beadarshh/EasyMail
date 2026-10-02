import { describe, expect, it } from "vitest";
import { hashPassword, passwordProblem, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies the right password and rejects others", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("correct horse batterY", h)).toBe(false);
  });
  it("salts every hash", async () => {
    expect(await hashPassword("same-password-1")).not.toBe(await hashPassword("same-password-1"));
  });
  it("rejects malformed hashes", async () => {
    expect(await verifyPassword("x", "plain")).toBe(false);
  });
  it("enforces a minimum length", () => {
    expect(passwordProblem("short")).toMatch(/10/);
    expect(passwordProblem("long-enough-pass")).toBeNull();
  });
});
