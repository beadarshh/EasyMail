import "server-only";
import { and, asc, count, desc, eq, gte, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { attachments, db, emailEvents, emails, identities, projects } from "@/db";

export const PAGE_SIZE = 50;

export type ListFilter = {
  direction: "inbound" | "outbound";
  projectId?: string;
  unread?: boolean;
  starred?: boolean;
  archived?: boolean;
  status?: string;
  q?: string;
  page?: number;
};

export async function listEmails(f: ListFilter) {
  const where: SQL[] = [eq(emails.direction, f.direction), eq(emails.isArchived, !!f.archived)];
  if (f.projectId) where.push(eq(emails.projectId, f.projectId));
  if (f.unread) where.push(eq(emails.isRead, false));
  if (f.starred) where.push(eq(emails.isStarred, true));
  if (f.status) where.push(eq(emails.status, f.status));
  if (f.q) {
    const term = `%${f.q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    where.push(
      or(
        ilike(emails.subject, term),
        ilike(emails.fromAddress, term),
        ilike(emails.fromName, term),
        ilike(emails.text, term),
        sql`array_to_string(${emails.to}, ',') ilike ${term}`,
      )!,
    );
  }
  const page = Math.max(1, f.page ?? 1);
  const rows = await db()
    .select({
      id: emails.id,
      threadId: emails.threadId,
      fromAddress: emails.fromAddress,
      fromName: emails.fromName,
      to: emails.to,
      subject: emails.subject,
      snippet: sql<string>`left(regexp_replace(coalesce(${emails.text}, ''), '\\s+', ' ', 'g'), 140)`,
      status: emails.status,
      source: emails.source,
      isRead: emails.isRead,
      isStarred: emails.isStarred,
      opens: emails.opens,
      clicks: emails.clicks,
      sentAt: emails.sentAt,
      projectName: projects.name,
      projectColor: projects.color,
      hasAttachments: sql<boolean>`exists(select 1 from ${attachments} where ${attachments.emailId} = ${emails.id})`,
    })
    .from(emails)
    .leftJoin(projects, eq(projects.id, emails.projectId))
    .where(and(...where))
    .orderBy(desc(emails.sentAt))
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE);
  return { rows: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE, page };
}

export type EmailRow = Awaited<ReturnType<typeof listEmails>>["rows"][number];

export async function getThread(threadId: string) {
  const list = await db()
    .select({ email: emails, projectName: projects.name, projectColor: projects.color })
    .from(emails)
    .leftJoin(projects, eq(projects.id, emails.projectId))
    .where(eq(emails.threadId, threadId))
    .orderBy(asc(emails.sentAt));
  if (!list.length) return null;
  const ids = list.map((l) => l.email.id);
  const [events, files] = await Promise.all([
    db().select().from(emailEvents).where(inArray(emailEvents.emailId, ids)).orderBy(asc(emailEvents.occurredAt)),
    db().select().from(attachments).where(inArray(attachments.emailId, ids)),
  ]);
  return list.map((l) => ({
    ...l,
    events: events.filter((e) => e.emailId === l.email.id),
    attachments: files.filter((a) => a.emailId === l.email.id),
  }));
}

export async function unreadCount() {
  const [r] = await db()
    .select({ n: count() })
    .from(emails)
    .where(and(eq(emails.direction, "inbound"), eq(emails.isRead, false), eq(emails.isArchived, false)));
  return r?.n ?? 0;
}

export async function listProjects() {
  return db().select().from(projects).orderBy(asc(projects.name));
}

export async function listIdentities() {
  return db()
    .select({ identity: identities, projectName: projects.name, projectColor: projects.color })
    .from(identities)
    .leftJoin(projects, eq(projects.id, identities.projectId))
    .orderBy(asc(identities.address));
}

export async function webhookHealth() {
  const [r] = await db().select({ at: sql<string | null>`max(${emailEvents.occurredAt})` }).from(emailEvents);
  const lastAt = r?.at ? new Date(r.at) : null;
  return { lastAt, fresh: !!lastAt && Date.now() - lastAt.getTime() < 7 * 86400_000 };
}

export function sinceDays(days: number) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d;
}

/** Everything the dashboard and analytics pages need, computed in Postgres. */
export async function analytics(opts: { days: number; projectId?: string }) {
  const since = sinceDays(opts.days);
  const scope: SQL[] = [gte(emails.sentAt, since)];
  if (opts.projectId) scope.push(eq(emails.projectId, opts.projectId));
  const scoped = and(...scope);

  const [daily, totals, byProject, topContacts, topLinks, hours] = await Promise.all([
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
        hour: sql<number>`extract(hour from ${emails.sentAt} at time zone ${process.env.APP_TIMEZONE || 'UTC'})::int`,
        n: sql<number>`count(*)::int`,
      })
      .from(emails)
      .where(and(scoped, eq(emails.direction, "inbound")))
      .groupBy(sql`1`),
  ]);

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

export function rate(n: number, d: number) {
  return d ? `${Math.round((n / d) * 1000) / 10}%` : "—";
}

/** Outbound mail that never got a delivery event (e.g. sent before the webhook existed). */
export const STUCK_STATUSES = ["queued", "sent", "scheduled"];

export async function stuckEmailCount() {
  const [r] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(emails)
    .where(
      and(
        eq(emails.direction, "outbound"),
        inArray(emails.status, STUCK_STATUSES),
        sql`${emails.resendId} is not null`,
        sql`${emails.sentAt} < now() - interval '5 minutes'`,
      ),
    );
  return r?.n ?? 0;
}
