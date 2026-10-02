import { describe, expect, it } from "vitest";
import {
  checkQuota,
  normalizeMessageId,
  parseAddress,
  parseMessageIds,
  replySubject,
  utcDay,
  utcMonthStart,
} from "./mail-utils";
import { nextStatus } from "./status";

const base = { sentToday: 0, receivedToday: 0, monthUsed: 0, dailyCap: 95, warnAt: 80, monthlyCap: 3000 };

describe("checkQuota", () => {
  it("allows sends under the cap", () => {
    expect(checkQuota(base)).toMatchObject({ allowed: true, level: "ok", remainingToday: 95 });
  });

  it("counts received mail toward the daily cap", () => {
    const r = checkQuota({ ...base, sentToday: 50, receivedToday: 45 });
    expect(r.allowed).toBe(false);
    expect(r.level).toBe("blocked");
  });

  it("blocks when a batch would exceed the remaining allowance", () => {
    expect(checkQuota({ ...base, sentToday: 93 }, 3).allowed).toBe(false);
    expect(checkQuota({ ...base, sentToday: 93 }, 2).allowed).toBe(true);
  });

  it("warns near the daily threshold", () => {
    expect(checkQuota({ ...base, sentToday: 79 }).level).toBe("warn");
  });

  it("blocks on the monthly cap", () => {
    const r = checkQuota({ ...base, monthUsed: 3000 });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/Monthly/);
  });
});

describe("UTC day boundaries", () => {
  it("uses the UTC date, not local time", () => {
    expect(utcDay(new Date("2026-10-03T23:59:59Z"))).toBe("2026-10-03");
    expect(utcDay(new Date("2026-10-04T00:00:00Z"))).toBe("2026-10-04");
    expect(utcDay(new Date("2026-10-04T03:00:00+05:30"))).toBe("2026-10-03");
  });
  it("computes month start", () => {
    expect(utcMonthStart(new Date("2026-10-31T12:00:00Z"))).toBe("2026-10-01");
  });
});

describe("threading helpers", () => {
  it("parses reference headers", () => {
    expect(parseMessageIds("<a@x.com> <b@y.com>\r\n <c@z.com>")).toEqual(["<a@x.com>", "<b@y.com>", "<c@z.com>"]);
    expect(parseMessageIds(null)).toEqual([]);
  });
  it("normalizes message ids", () => {
    expect(normalizeMessageId("abc@x.com")).toBe("<abc@x.com>");
    expect(normalizeMessageId("<abc@x.com>")).toBe("<abc@x.com>");
    expect(normalizeMessageId("")).toBeNull();
  });
  it("prefixes reply subjects once", () => {
    expect(replySubject("Hello")).toBe("Re: Hello");
    expect(replySubject("RE: Hello")).toBe("RE: Hello");
  });
  it("parses display-name addresses", () => {
    expect(parseAddress('"Ada L" <Ada@Example.com>')).toEqual({ name: "Ada L", address: "ada@example.com" });
    expect(parseAddress("bob@example.com")).toEqual({ name: null, address: "bob@example.com" });
  });
});

describe("nextStatus", () => {
  it("only moves forward", () => {
    expect(nextStatus("delivered", "sent")).toBe("delivered");
    expect(nextStatus("sent", "opened")).toBe("opened");
    expect(nextStatus("clicked", "opened")).toBe("clicked");
  });
  it("lets failures win and complaints override bounces", () => {
    expect(nextStatus("opened", "bounced")).toBe("bounced");
    expect(nextStatus("bounced", "delivered")).toBe("bounced");
    expect(nextStatus("bounced", "complained")).toBe("complained");
  });
});
