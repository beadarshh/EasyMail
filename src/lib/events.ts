import "server-only";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import type { WebhookEventPayload } from "resend";
import { db, emailEvents, emails, projects } from "@/db";
import { touchContact } from "./kv";
import { normalizeMessageId, parseAddress } from "./mail-utils";
import { recordSent } from "./quota";
import { nextStatus, STATUS_FROM_EVENT } from "./status";
import { findIdentity } from "./threads";

type OutboundEvent = Exclude<Extract<WebhookEventPayload, { type: `email.${string}` }>, { type: "email.received" }>;

/**
 * Delivery / engagement events cost zero API calls. Mail sent by your other apps
 * through the same Resend account is picked up here too (source = "external").
 */
export async function handleOutboundEvent(event: OutboundEvent, webhookId: string) {
  const d = event.data;
  const occurredAt = new Date(event.created_at);
  const emailId = await findOrCreateOutbound(d);

  const meta: Record<string, unknown> = {};
  if (event.type === "email.bounced") meta.bounce = event.data.bounce;
  if (event.type === "email.clicked") meta.click = { link: event.data.click.link, userAgent: event.data.click.userAgent };
  if (event.type === "email.failed") meta.failed = event.data.failed;
  if (event.type === "email.suppressed") meta.suppressed = event.data.suppressed;

  const [inserted] = await db()
    .insert(emailEvents)
    .values({ webhookId, emailId, type: event.type, meta, occurredAt })
    .onConflictDoNothing({ target: emailEvents.webhookId })
    .returning({ id: emailEvents.id });
  if (!inserted) return { duplicate: true };

  const [current] = await db().select({ status: emails.status }).from(emails).where(eq(emails.id, emailId));
  const incoming = STATUS_FROM_EVENT[event.type];
  const patch: PgUpdateSetSource<typeof emails> = {};
  if (incoming && current) patch.status = nextStatus(current.status, incoming);
  if (d.message_id) patch.messageId = sql`coalesce(${emails.messageId}, ${normalizeMessageId(d.message_id)})`;
  const failed = current && ["bounced", "complained", "failed", "suppressed"].includes(current.status);
  if (event.type === "email.delivered" && !failed) patch.deliveredAt = sql`coalesce(${emails.deliveredAt}, ${occurredAt.toISOString()}::timestamptz)`;
  if (event.type === "email.bounced") patch.bouncedAt = occurredAt;
  if (event.type === "email.opened") {
    patch.opens = sql`${emails.opens} + 1`;
    patch.firstOpenedAt = sql`coalesce(${emails.firstOpenedAt}, ${occurredAt.toISOString()}::timestamptz)`;
  }
  if (event.type === "email.clicked") patch.clicks = sql`${emails.clicks} + 1`;

  await db().update(emails).set(patch).where(eq(emails.id, emailId));
  return { duplicate: false };
}

async function findOrCreateOutbound(d: OutboundEvent["data"]) {
  const [existing] = await db().select({ id: emails.id }).from(emails).where(eq(emails.resendId, d.email_id));
  if (existing) return existing.id;

  const from = parseAddress(d.from);
  const tags = (d.tags ?? {}) as Record<string, string>;
  let projectId: string | null = null;
  if (tags.project) {
    const [p] = await db().select({ id: projects.id }).from(projects).where(eq(projects.slug, tags.project));
    projectId = p?.id ?? null;
  }
  const identity = await findIdentity([from.address], "send");
  const sentAt = new Date(d.created_at);

  const [row] = await db()
    .insert(emails)
    .values({
      resendId: d.email_id,
      direction: "outbound",
      source: "external",
      projectId: projectId ?? identity?.projectId ?? null,
      identityId: identity?.id ?? null,
      fromAddress: from.address,
      fromName: from.name,
      to: d.to,
      subject: d.subject ?? "",
      messageId: normalizeMessageId(d.message_id),
      threadId: randomUUID(),
      status: "queued",
      tags,
      isRead: true,
      sentAt,
    })
    .onConflictDoNothing({ target: emails.resendId })
    .returning({ id: emails.id });

  if (row) {
    await recordSent(1, sentAt);
    await Promise.all(d.to.map((t) => touchContact(parseAddress(t).address, null, "sent", sentAt)));
    return row.id;
  }
  const [again] = await db().select({ id: emails.id }).from(emails).where(eq(emails.resendId, d.email_id));
  return again.id;
}
