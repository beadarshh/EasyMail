import "server-only";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import type { EmailReceivedEvent, WebhookEventPayload } from "resend";
import { attachments, emailEvents, emails } from "@/db/schema";
import { env, storageEnabled } from "@/lib/env";
import { headerValue, normalizeMessageId, parseAddress, parseMessageIds } from "@/lib/mail-utils";
import { resend, throttled } from "@/lib/resend";
import { nextStatus, STATUS_FROM_EVENT } from "@/lib/status";
import { logActivity, type ActivityType } from "./activity.service";
import { findIdentity, findProjectIdBySlug } from "./project.service";
import { resolveThreadId } from "./mail.service";
import { recordReceived, recordSent } from "./quota.service";
import { touchContact } from "./settings.service";
import { uploadAttachment } from "./storage.service";
import { db } from "./supabase";

// Everything that arrives from Resend webhooks: received mail, and delivery / engagement events.

// ─── email.received ─────────────────────────────────────────────────────

/**
 * email.received → one `receiving.get` call (webhooks carry no body), store the
 * full message permanently (Resend only keeps it 30 days), then optionally copy
 * attachments to Supabase Storage.
 */
export async function ingestInbound(event: EmailReceivedEvent, webhookId: string) {
  const resendId = event.data.email_id;

  const [existing] = await db().select({ id: emails.id }).from(emails).where(eq(emails.resendId, resendId));
  if (existing) return { duplicate: true };

  const { data: full, error } = await throttled(() => resend().emails.receiving.get(resendId));
  if (error || !full) throw new Error(`receiving.get failed: ${error?.message ?? "no data"}`);

  const from = parseAddress(full.from);
  const recipients = [...(full.received_for ?? []), ...full.to, ...(full.cc ?? [])].map((a) => parseAddress(a).address);
  const identity = await findIdentity(recipients, "receive");

  const inReplyTo = normalizeMessageId(headerValue(full.headers, "in-reply-to"));
  const references = parseMessageIds(headerValue(full.headers, "references"));
  const threadId = await resolveThreadId([inReplyTo, ...references]);
  const receivedAt = new Date(full.created_at);

  const [row] = await db()
    .insert(emails)
    .values({
      resendId,
      direction: "inbound",
      source: "external",
      projectId: identity?.projectId ?? null,
      identityId: identity?.id ?? null,
      fromAddress: from.address,
      fromName: from.name,
      to: full.to,
      cc: full.cc ?? [],
      bcc: full.bcc ?? [],
      replyTo: full.reply_to ?? [],
      subject: full.subject ?? "",
      text: full.text,
      html: full.html,
      messageId: normalizeMessageId(full.message_id),
      inReplyTo,
      references,
      threadId,
      status: "received",
      sentAt: receivedAt,
    })
    .onConflictDoNothing({ target: emails.resendId })
    .returning();
  if (!row) return { duplicate: true }; // a concurrent delivery won the race

  await Promise.all([
    recordReceived(1, receivedAt),
    touchContact(from.address, from.name, "received", receivedAt),
    db()
      .insert(emailEvents)
      .values({ webhookId, emailId: row.id, type: "email.received", occurredAt: receivedAt })
      .onConflictDoNothing(),
  ]);

  await saveInboundAttachments(row.id, resendId, full.attachments ?? []);
  await logActivity({
    type: "email.received",
    title: `Received "${row.subject || "(no subject)"}" from ${from.address}`,
    emailId: row.id,
    threadId,
    projectId: row.projectId,
  });
  return { duplicate: false, id: row.id };
}

type InboundAtt = { id: string; filename: string | null; size: number; content_type: string; content_id: string | null; content_disposition: string | null };

async function saveInboundAttachments(emailId: string, resendEmailId: string, list: InboundAtt[]) {
  // Inline images are already embedded in the HTML as data: URIs.
  const files = list.filter((a) => a.content_disposition !== "inline");
  if (!files.length) return;

  const e = env();
  const archive = e.ARCHIVE_ATTACHMENTS && storageEnabled();

  for (const a of files) {
    const filename = a.filename || "attachment";
    let storagePath: string | null = null;
    if (archive && a.size <= e.ARCHIVE_MAX_MB * 1024 * 1024) {
      try {
        storagePath = await archiveOne(emailId, resendEmailId, a.id, filename, a.content_type);
      } catch (err) {
        // Not fatal: it can still be fetched from Resend on demand for 30 days.
        console.error("[ingest] attachment archive failed", a.id, err);
      }
    }
    await db().insert(attachments).values({
      emailId,
      resendAttachmentId: a.id,
      filename,
      contentType: a.content_type,
      size: a.size,
      contentId: a.content_id,
      storagePath,
    });
  }
}

async function archiveOne(emailId: string, resendEmailId: string, attId: string, filename: string, contentType: string) {
  const { data, error } = await throttled(() =>
    resend().emails.receiving.attachments.get({ emailId: resendEmailId, id: attId }),
  );
  if (error || !data) throw new Error(error?.message ?? "no attachment data");
  const res = await fetch(data.download_url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  const path = `${emailId}/${attId}-${filename.replace(/[^\w.\-]+/g, "_")}`;
  return uploadAttachment(path, await res.arrayBuffer(), contentType);
}

// ─── Delivery / engagement events ───────────────────────────────────────

type OutboundEvent = Exclude<Extract<WebhookEventPayload, { type: `email.${string}` }>, { type: "email.received" }>;

const LOGGED: Partial<Record<OutboundEvent["type"], { type: ActivityType; verb: string }>> = {
  "email.delivered": { type: "email.delivered", verb: "Delivered" },
  "email.opened": { type: "email.opened", verb: "Opened" },
  "email.clicked": { type: "email.clicked", verb: "Link clicked in" },
  "email.bounced": { type: "email.bounced", verb: "Bounced" },
  "email.complained": { type: "email.complained", verb: "Marked as spam" },
  "email.failed": { type: "email.failed", verb: "Failed" },
  "email.suppressed": { type: "email.suppressed", verb: "Suppressed" },
};

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

  const [current] = await db()
    .select({ status: emails.status, threadId: emails.threadId, projectId: emails.projectId })
    .from(emails)
    .where(eq(emails.id, emailId));
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

  const logged = LOGGED[event.type];
  if (logged) {
    await logActivity({
      type: logged.type,
      title: `${logged.verb} "${d.subject || "(no subject)"}" to ${d.to[0] ?? "recipient"}`,
      emailId,
      threadId: current?.threadId,
      projectId: current?.projectId,
    });
  }
  return { duplicate: false };
}

async function findOrCreateOutbound(d: OutboundEvent["data"]) {
  const [existing] = await db().select({ id: emails.id }).from(emails).where(eq(emails.resendId, d.email_id));
  if (existing) return existing.id;

  const from = parseAddress(d.from);
  const tags = (d.tags ?? {}) as Record<string, string>;
  const projectId = tags.project ? await findProjectIdBySlug(tags.project) : null;
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
