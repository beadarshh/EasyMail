import "server-only";
import { eq } from "drizzle-orm";
import type { EmailReceivedEvent } from "resend";
import { attachments, db, emailEvents, emails } from "@/db";
import { env, storageEnabled } from "./env";
import { touchContact } from "./kv";
import { headerValue, normalizeMessageId, parseAddress, parseMessageIds } from "./mail-utils";
import { recordReceived } from "./quota";
import { resend, throttled } from "./resend";
import { uploadAttachment } from "./storage";
import { findIdentity, resolveThreadId } from "./threads";

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
