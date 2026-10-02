import "server-only";
import { gte, sql } from "drizzle-orm";
import { db, quotaUsage } from "@/db";
import { env } from "./env";
import { checkQuota, utcDay, utcMonthStart, type QuotaCheck } from "./mail-utils";

export async function getUsage() {
  const today = utcDay();
  const rows = await db()
    .select()
    .from(quotaUsage)
    .where(gte(quotaUsage.day, utcMonthStart()));
  const t = rows.find((r) => r.day === today);
  const monthSent = rows.reduce((a, r) => a + r.sent, 0);
  const monthReceived = rows.reduce((a, r) => a + r.received, 0);
  return {
    sentToday: t?.sent ?? 0,
    receivedToday: t?.received ?? 0,
    monthSent,
    monthReceived,
    monthUsed: monthSent + monthReceived,
  };
}

export async function canSend(count = 1): Promise<QuotaCheck & { dailyCap: number; monthlyCap: number }> {
  const u = await getUsage();
  const e = env();
  const q = checkQuota(
    { ...u, dailyCap: e.DAILY_SEND_CAP, warnAt: e.DAILY_WARN_AT, monthlyCap: e.MONTHLY_CAP },
    count,
  );
  return { ...q, dailyCap: e.DAILY_SEND_CAP, monthlyCap: e.MONTHLY_CAP };
}

async function bump(column: "sent" | "received", n: number, at: Date) {
  const day = utcDay(at);
  await db()
    .insert(quotaUsage)
    .values({ day, sent: column === "sent" ? n : 0, received: column === "received" ? n : 0 })
    .onConflictDoUpdate({
      target: quotaUsage.day,
      set: { [column]: sql`${quotaUsage[column]} + ${n}` },
    });
}

export const recordSent = (n = 1, at = new Date()) => bump("sent", n, at);
export const recordReceived = (n = 1, at = new Date()) => bump("received", n, at);
