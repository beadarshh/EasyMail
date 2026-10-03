import "server-only";
import { gte, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { quotaUsage } from "@/db/schema";
import { env } from "@/lib/env";
import { checkQuota, utcDay, utcMonthStart, type QuotaCheck } from "@/lib/mail-utils";
import { invalidate, TAG } from "./cache";
import { db, readDb } from "./supabase";

export async function getUsage() {
  const today = utcDay();
  const rows = await readDb(() => db().select().from(quotaUsage).where(gte(quotaUsage.day, utcMonthStart())));
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

const cachedUsage = unstable_cache(getUsage, ["usage"], { tags: [TAG.shell], revalidate: 120 });

/**
 * For display (sidebar meters, dashboard): served from the data cache and refreshed whenever usage
 * changes, and deduped within one render. Sending must use getUsage / canSend, which always read fresh.
 */
export const getUsageOnce = cache(cachedUsage);

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
  invalidate(TAG.shell, TAG.dashboard);
}

export const recordSent = (n = 1, at = new Date()) => bump("sent", n, at);
export const recordReceived = (n = 1, at = new Date()) => bump("received", n, at);

/** Overwrites one day's counters with Resend's authoritative numbers (daily cron). */
export async function setDayUsage(day: string, sent: number, received: number) {
  await db()
    .insert(quotaUsage)
    .values({ day, sent, received })
    .onConflictDoUpdate({ target: quotaUsage.day, set: { sent, received } });
  invalidate(TAG.shell, TAG.dashboard);
}
