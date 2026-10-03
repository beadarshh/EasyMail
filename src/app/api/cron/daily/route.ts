import { env } from "@/lib/env";
import { utcDay } from "@/lib/mail-utils";
import { resend, throttled } from "@/lib/resend";
import { pruneActivity } from "@/services/activity.service";
import { setDayUsage } from "@/services/quota.service";
import { setSetting } from "@/services/settings.service";

/**
 * Runs once a day (Vercel Hobby allows daily crons). One Resend API call:
 * - snapshots Resend's authoritative usage,
 * - corrects that day's local quota counters to match,
 * - trims the activity log to 90 days,
 * - and, by querying Postgres, keeps the free Supabase project from pausing.
 */
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { data, error } = await throttled(() => resend().usage.get());
  if (error || !data) return Response.json({ ok: false, error: error?.message }, { status: 502 });

  await setSetting("resend_usage", {
    ...data.emails,
    rate_limit: data.rate_limit,
    domains: data.domains,
    fetchedAt: new Date().toISOString(),
  });

  // The daily window ends at resets_at, so the numbers belong to the day before it.
  const day = utcDay(new Date(new Date(data.emails.daily.resets_at).getTime() - 1));
  const { sent, received } = data.emails.daily;
  await setDayUsage(day, sent, received);

  // Not fatal: the table may not exist until the latest migration has been applied.
  const pruned = await pruneActivity(90).catch((err) => {
    console.error("[cron] activity prune failed", (err as Error).message);
    return 0;
  });

  return Response.json({ ok: true, day, sent, received, pruned });
}
