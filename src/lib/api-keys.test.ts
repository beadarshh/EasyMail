import { describe, expect, it } from "vitest";
import { buildContactMessage, generateApiKey, hashApiKey, normalizeHost, originAllowed, parseHosts } from "./api-keys";

describe("api keys", () => {
  it("generates a prefixed key whose hash matches", () => {
    const { key, hash, prefix } = generateApiKey();
    expect(key.startsWith("em_")).toBe(true);
    expect(hash).toBe(hashApiKey(key));
    expect(key.startsWith(prefix)).toBe(true);
    expect(generateApiKey().key).not.toBe(key);
  });

  it("normalises hosts", () => {
    expect(normalizeHost("https://WWW.Beadarsh.in/path")).toBe("www.beadarsh.in");
    expect(normalizeHost("beadarsh.in")).toBe("beadarsh.in");
    expect(normalizeHost("localhost:5173")).toBe("localhost");
    expect(normalizeHost("not a host")).toBeNull();
    expect(parseHosts("beadarsh.in, https://www.beadarsh.in\nbeadarsh.in")).toEqual(["beadarsh.in", "www.beadarsh.in"]);
  });

  it("only allows listed origins", () => {
    const allowed = ["beadarsh.in", "www.beadarsh.in"];
    expect(originAllowed("https://www.beadarsh.in", allowed)).toBe(true);
    expect(originAllowed("https://evil.com", allowed)).toBe(false);
    expect(originAllowed("https://beadarsh.in.evil.com", allowed)).toBe(false);
    expect(originAllowed(null, allowed)).toBe(false);
  });

  it("escapes visitor input", () => {
    const m = buildContactMessage("Portfolio", { name: "<b>x</b>", email: "a@b.co", message: "<script>alert(1)</script>" });
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.subject).toContain("Portfolio");
  });
});
