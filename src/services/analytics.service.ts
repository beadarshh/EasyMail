import "server-only";
import { and, desc, eq, gte, sql, type SQL } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { emailEvents, emails, projects } from "@/db/schema";
import { TAG } from "./cache";
import { db, readDb } from "./supabase";

export function sinceDays(days: number) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d;
}

/** Everything the dashboard needs, computed in Postgres. */
async function computeAnalytics(opts: { days: number; projectId?: string }) {
  const since = sinceDays(opts.days);
  const scope: SQL[] = [gte(emails.sentAt, since)];
  if (opts.projectId) scope.push(eq(emails.projectId, opts.projectId));
  const scoped = and(...scope);

  const [daily, totals, byProject, topContacts, topLinks, hours] = await readDb(() =>
    Promise.all([
      db()
        .select({
          day: sql<string>`to_char(date_trunc('day', ${emails.sentAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
          sent: sql<number>`count(*) filter (where ${emails.direction} = 'outbound')::int`,
          received: sql<number>`count(*) filter (where ${emails.direction} = 'inbound')::int`,
        })
        .from(emails)
        .where(scoped)
        .groupBy(sql`1`)
        .orderBy(sql`1`),
      db()
        .select({
          sent: sql<number>`count(*) filter (where ${emails.direction} = 'outbound')::int`,
          received: sql<number>`count(*) filter (where ${emails.direction} = 'inbound')::int`,
          delivered: sql<number>`count(*) filter (where ${emails.direction} = 'outbound' and ${emails.deliveredAt} is not null)::int`,
          opened: sql<number>`count(*) filter (where ${emails.direction} = 'outbound' and ${emails.firstOpenedAt} is not null)::int`,
          clicked: sql<number>`count(*) filter (where ${emails.direction} = 'outbound' and ${emails.clicks} > 0)::int`,
          bounced: sql<number>`count(*) filter (where ${emails.status} = 'bounced')::int`,
          complained: sql<number>`count(*) filter (where ${emails.status} = 'complained')::int`,
        })
        .from(emails)
        .where(scoped),
      db()
        .select({
          projectId: emails.projectId,
          name: sql<string>`coalesce(${projects.name}, 'Unassigned')`,
          color: projects.color,
          sent: sql<number>`count(*) filter (where ${emails.direction} = 'outbound')::int`,
          received: sql<number>`count(*) filter (where ${emails.direction} = 'inbound')::int`,
          delivered: sql<number>`count(*) filter (where ${emails.deliveredAt} is not null)::int`,
          opened: sql<number>`count(*) filter (where ${emails.firstOpenedAt} is not null)::int`,
          bounced: sql<number>`count(*) filter (where ${emails.status} in ('bounced','complained'))::int`,
        })
        .from(emails)
        .leftJoin(projects, eq(projects.id, emails.projectId))
        .where(scoped)
        .groupBy(emails.projectId, projects.name, projects.color)
        .orderBy(desc(sql`count(*)`)),
      db().execute<{ address: string; sent: number; received: number }>(sql`
        select address, sum(sent)::int as sent, sum(received)::int as received from (
          select lower(unnest(${emails.to})) as address, 1 as sent, 0 as received
            from ${emails} where ${scoped} and ${emails.direction} = 'outbound'
          union all
          select ${emails.fromAddress}, 0, 1 from ${emails} where ${scoped} and ${emails.direction} = 'inbound'
        ) t group by address order by count(*) desc limit 10`),
      db()
        .select({ link: sql<string>`${emailEvents.meta} -> 'click' ->> 'link'`, clicks: sql<number>`count(*)::int` })
        .from(emailEvents)
        .innerJoin(emails, eq(emails.id, emailEvents.emailId))
        .where(and(eq(emailEvents.type, "email.clicked"), scoped))
        .groupBy(sql`1`)
        .orderBy(desc(sql`2`))
        .limit(10),
      db()
        .select({
          hour: sql<number>`extract(hour from ${emails.sentAt} at time zone ${process.env.APP_TIMEZONE || "UTC"})::int`,
          n: sql<number>`count(*)::int`,
        })
        .from(emails)
        .where(and(scoped, eq(emails.direction, "inbound")))
        .groupBy(sql`1`),
    ]),
  );

  // Fill missing days so charts have a continuous axis.
  const series: { day: string; sent: number; received: number }[] = [];
  for (let i = 0; i < opts.days; i++) {
    const d = new Date(since);
    d.setUTCDate(since.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    const hit = daily.find((r) => r.day === key);
    series.push({ day: key, sent: hit?.sent ?? 0, received: hit?.received ?? 0 });
  }
  const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: h, n: hours.find((x) => x.hour === h)?.n ?? 0 }));

  return { series, totals: totals[0], byProject, topContacts: [...topContacts], topLinks, hourly };
}

/**
 * Dashboard stats, cached per (days, project). Reloading the dashboard or flipping filters
 * back and forth costs no database queries until something is logged (a send, a received
 * mail, a delivery event...), which invalidates TAG.dashboard. The TTL is a safety net.
 */
export const analytics = unstable_cache(computeAnalytics, ["dashboard-analytics"], { tags: [TAG.dashboard], revalidate: 300 });
