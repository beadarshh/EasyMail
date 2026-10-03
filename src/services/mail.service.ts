import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { attachments, emailEvents, emails, projects } from "@/db/schema";
import { normalizeMessageId } from "@/lib/mail-utils";
import { nextStatus } from "@/lib/status";
import { resend, throttled } from "@/lib/resend";
import { logActivity } from "./activity.service";
import { invalidate, TAG } from "./cache";
import { removeAttachments } from "./storage.service";
import { db, readDb } from "./supabase";

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
  /** Rows to return (default PAGE_SIZE). */
  limit?: number;
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
  const size = f.limit ?? PAGE_SIZE;
  const rows = await readDb(() =>
    db()
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
      .limit(size + 1)
      .offset((page - 1) * size),
  );
  return { rows: rows.slice(0, size), hasMore: rows.length > size, page };
}

export type EmailRow = Awaited<ReturnType<typeof listEmails>>["rows"][number];

const cachedLatest = unstable_cache(
  async (direction: "inbound" | "outbound", limit: number) => (await listEmails({ direction, limit })).rows,
  ["latest-emails"],
  // Refreshed whenever something is logged or a flag changes; the TTL is only a safety net.
  { tags: [TAG.dashboard], revalidate: 300 },
);

/** Newest mail for the dashboard lists, from the data cache between writes. */
export async function latestEmails(direction: "inbound" | "outbound", limit = 5): Promise<EmailRow[]> {
  const rows = await cachedLatest(direction, limit);
  // The cache serialises to JSON, so dates come back as strings.
  return rows.map((r) => ({ ...r, sentAt: new Date(r.sentAt) }));
}

export async function getEmail(id: string) {
  const [row] = await readDb(() => db().select().from(emails).where(eq(emails.id, id)));
  return row ?? null;
}

export async function threadSubject(threadId: string) {
  const [first] = await readDb(() => db().select({ subject: emails.subject }).from(emails).where(eq(emails.threadId, threadId)).limit(1));
  return first?.subject ?? null;
}

export async function getThread(threadId: string) {
  const list = await readDb(() =>
    db()
      .select({ email: emails, projectName: projects.name, projectColor: projects.color })
      .from(emails)
      .leftJoin(projects, eq(projects.id, emails.projectId))
      .where(eq(emails.threadId, threadId))
      .orderBy(asc(emails.sentAt)),
  );
  if (!list.length) return null;
  const ids = list.map((l) => l.email.id);
  const [events, files] = await readDb(() =>
    Promise.all([
      db().select().from(emailEvents).where(inArray(emailEvents.emailId, ids)).orderBy(asc(emailEvents.occurredAt)),
      db().select().from(attachments).where(inArray(attachments.emailId, ids)),
    ]),
  );
  return list.map((l) => ({
    ...l,
    events: events.filter((e) => e.emailId === l.email.id),
    attachments: files.filter((a) => a.emailId === l.email.id),
  }));
}

/** Reuse the thread of any email whose Message-ID appears in In-Reply-To/References. */
export async function resolveThreadId(relatedIds: (string | null | undefined)[]) {
  const ids = [...new Set(relatedIds.map(normalizeMessageId).filter((x): x is string => !!x))];
  if (ids.length) {
    const [hit] = await readDb(() =>
      db()
        .select({ threadId: emails.threadId })
        .from(emails)
        .where(inArray(emails.messageId, ids))
        .orderBy(desc(emails.sentAt))
        .limit(1),
    );
    if (hit) return hit.threadId;
  }
  return randomUUID();
}

// ─── Unread badge ───────────────────────────────────────────────────────

async function countUnread() {
  const [r] = await readDb(() =>
    db()
      .select({ n: count() })
      .from(emails)
      .where(and(eq(emails.direction, "inbound"), eq(emails.isRead, false), eq(emails.isArchived, false))),
  );
  return r?.n ?? 0;
}

/** Cached for the sidebar; refreshed whenever mail arrives or flags change. */
export const unreadCount = unstable_cache(countUnread, ["unread-count"], { tags: [TAG.shell], revalidate: 120 });

// ─── Flags and deletes ──────────────────────────────────────────────────

export async function setFlags(ids: string[], flags: { isRead?: boolean; isStarred?: boolean; isArchived?: boolean }) {
  if (!ids.length) return;
  await db().update(emails).set(flags).where(inArray(emails.id, ids));
  invalidate(TAG.shell, TAG.dashboard);
}

export async function markRead(ids: string[]) {
  if (!ids.length) return;
  await db().update(emails).set({ isRead: true }).where(inArray(emails.id, ids));
  invalidate(TAG.shell, TAG.dashboard);
}

export async function deleteThread(threadId: string, actor?: string) {
  const rows = await db().select({ id: emails.id }).from(emails).where(eq(emails.threadId, threadId));
  const files = rows.length
    ? await db().select({ path: attachments.storagePath }).from(attachments).where(inArray(attachments.emailId, rows.map((r) => r.id)))
    : [];
  await removeAttachments(files.map((f) => f.path).filter((p): p is string => !!p));
  await db().delete(emails).where(eq(emails.threadId, threadId));
  await logActivity({ type: "thread.deleted", title: `Deleted a conversation (${rows.length} message${rows.length === 1 ? "" : "s"})`, actor });
  invalidate(TAG.shell, TAG.dashboard);
}

// ─── Webhook / delivery health ──────────────────────────────────────────

export async function webhookHealth() {
  const [r] = await readDb(() => db().select({ at: sql<string | null>`max(${emailEvents.occurredAt})` }).from(emailEvents));
  const lastAt = r?.at ? new Date(r.at) : null;
  return { lastAt, fresh: !!lastAt && Date.now() - lastAt.getTime() < 7 * 86400_000 };
}

/** Outbound mail that never got a delivery event (e.g. sent before the webhook existed). */
export const STUCK_STATUSES = ["queued", "sent", "scheduled"];

const stuckWhere = () =>
  and(
    eq(emails.direction, "outbound"),
    inArray(emails.status, STUCK_STATUSES),
    sql`${emails.resendId} is not null`,
    sql`${emails.sentAt} < now() - interval '5 minutes'`,
  );

export async function stuckEmailCount() {
  const [r] = await readDb(() => db().select({ n: sql<number>`count(*)::int` }).from(emails).where(stuckWhere()));
  return r?.n ?? 0;
}

/**
 * For mail sent before the webhook existed (or whose events were missed): ask Resend for each
 * email's last event. 1 API call per email, on click only.
 */
export async function refreshStuckStatuses(actor?: string) {
  const rows = await db()
    .select({ id: emails.id, resendId: emails.resendId, status: emails.status, sentAt: emails.sentAt })
    .from(emails)
    .where(stuckWhere())
    .limit(25);

  let updated = 0;
  for (const row of rows) {
    const { data, error } = await throttled(() => resend().emails.get(row.resendId!));
    if (error || !data) continue;
    const last = data.last_event === "canceled" ? "failed" : data.last_event;
    const status = nextStatus(row.status, last);
    if (status === row.status) continue;
    const reached = (s: string) => ["delivered", "opened", "clicked"].includes(s);
    await db()
      .update(emails)
      .set({
        status,
        messageId: sql`coalesce(${emails.messageId}, ${normalizeMessageId(data.message_id)})`,
        deliveredAt: reached(status) ? sql`coalesce(${emails.deliveredAt}, ${row.sentAt.toISOString()}::timestamptz)` : undefined,
        firstOpenedAt: ["opened", "clicked"].includes(status) ? sql`coalesce(${emails.firstOpenedAt}, ${row.sentAt.toISOString()}::timestamptz)` : undefined,
        opens: ["opened", "clicked"].includes(status) ? sql`greatest(${emails.opens}, 1)` : undefined,
        clicks: status === "clicked" ? sql`greatest(${emails.clicks}, 1)` : undefined,
        bouncedAt: status === "bounced" ? new Date() : undefined,
      })
      .where(eq(emails.id, row.id));
    updated++;
  }
  if (rows.length) {
    await logActivity({ type: "status.refreshed", title: `Checked ${rows.length} undelivered email${rows.length === 1 ? "" : "s"} with Resend (${updated} updated)`, actor });
  }
  invalidate(TAG.dashboard);
  return { checked: rows.length, updated };
}

// ─── Downloads and exports ──────────────────────────────────────────────

export async function getAttachmentForDownload(id: string) {
  const [row] = await readDb(() =>
    db()
      .select({ a: attachments, resendEmailId: emails.resendId, direction: emails.direction })
      .from(attachments)
      .innerJoin(emails, eq(emails.id, attachments.emailId))
      .where(eq(attachments.id, id)),
  );
  return row ?? null;
}

/** Every email, flattened for CSV. */
export async function exportEmailsFlat() {
  return readDb(() =>
    db()
      .select({
        id: emails.id,
        direction: emails.direction,
        source: emails.source,
        project: projects.name,
        sentAt: emails.sentAt,
        from: emails.fromAddress,
        to: emails.to,
        cc: emails.cc,
        subject: emails.subject,
        status: emails.status,
        opens: emails.opens,
        clicks: emails.clicks,
        deliveredAt: emails.deliveredAt,
        firstOpenedAt: emails.firstOpenedAt,
        threadId: emails.threadId,
        text: emails.text,
      })
      .from(emails)
      .leftJoin(projects, eq(projects.id, emails.projectId))
      .orderBy(asc(emails.sentAt)),
  );
}

/** Every email with all columns, for the JSON export. */
export async function exportEmailsFull() {
  return readDb(() => db().select().from(emails).orderBy(asc(emails.sentAt)));
}
