import "server-only";
import { randomUUID } from "node:crypto";
import { attachments as attachmentsTable, emails } from "@/db/schema";
import { env, storageEnabled } from "@/lib/env";
import { formatAddress, parseAddress } from "@/lib/mail-utils";
import { resend, throttled } from "@/lib/resend";
import { logActivity } from "./activity.service";
import { getEmail } from "./mail.service";
import { getIdentity, getProject } from "./project.service";
import { canSend, recordSent } from "./quota.service";
import { touchContact } from "./settings.service";
import { uploadAttachment } from "./storage.service";
import { db } from "./supabase";

export type SendInput = {
  identityId: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  html: string;
  text: string;
  replyToEmailId?: string;
  files: File[];
  /** Admin username, for the activity log. */
  actor?: string;
};

export type SendResult = { error: string } | { threadId: string; emailId: string };

/** Quota check → Resend → store in Postgres → contacts → attachment archive → activity log. */
export async function sendMail(input: SendInput): Promise<SendResult> {
  const totalBytes = input.files.reduce((a, f) => a + f.size, 0);
  const maxMb = env().MAX_ATTACHMENT_MB;
  if (totalBytes > maxMb * 1024 * 1024) return { error: `Attachments exceed ${maxMb} MB in total` };

  const quota = await canSend(1);
  if (!quota.allowed) return { error: quota.reason ?? "Daily or monthly send limit reached" };

  const identity = await getIdentity(input.identityId);
  if (!identity?.canSend) return { error: "That From address can't send" };
  const project = identity.projectId ? await getProject(identity.projectId) : null;

  // Threading: continue the parent's conversation in both EasyMail and the recipient's client.
  let threadId: string = randomUUID();
  let inReplyTo: string | null = null;
  let references: string[] = [];
  const headers: Record<string, string> = {};
  if (input.replyToEmailId) {
    const parent = await getEmail(input.replyToEmailId);
    if (parent) {
      threadId = parent.threadId;
      if (parent.messageId) {
        inReplyTo = parent.messageId;
        references = [...parent.references, parent.messageId].slice(-20);
        headers["In-Reply-To"] = inReplyTo;
        headers["References"] = references.join(" ");
      }
    }
  }

  const fileData = await Promise.all(input.files.map(async (f) => ({ file: f, buffer: Buffer.from(await f.arrayBuffer()) })));
  const subject = input.subject || "(no subject)";

  const { data, error } = await throttled(() =>
    resend().emails.send(
      {
        from: formatAddress(identity.displayName, identity.address),
        to: input.to,
        cc: input.cc.length ? input.cc : undefined,
        bcc: input.bcc.length ? input.bcc : undefined,
        subject,
        html: input.html,
        text: input.text,
        headers: Object.keys(headers).length ? headers : undefined,
        tags: [
          { name: "app", value: "easymail" },
          ...(project ? [{ name: "project", value: project.slug }] : []),
        ],
        attachments: fileData.length
          ? fileData.map(({ file, buffer }) => ({ filename: file.name, content: buffer, contentType: file.type || undefined }))
          : undefined,
      },
      { idempotencyKey: `easymail-${randomUUID()}` },
    ),
  );
  if (error || !data) return { error: `Resend rejected the email: ${error?.message ?? "unknown error"}` };

  const now = new Date();
  const [row] = await db()
    .insert(emails)
    .values({
      resendId: data.id,
      direction: "outbound",
      source: "easymail",
      projectId: identity.projectId,
      identityId: identity.id,
      fromAddress: identity.address,
      fromName: identity.displayName,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject,
      text: input.text,
      html: input.html,
      inReplyTo,
      references,
      threadId,
      status: "queued",
      isRead: true,
      tags: { app: "easymail", ...(project ? { project: project.slug } : {}) },
      sentAt: now,
    })
    .returning({ id: emails.id });

  await Promise.all([
    recordSent(1, now),
    ...[...input.to, ...input.cc, ...input.bcc].map((a) => {
      const p = parseAddress(a);
      return touchContact(p.address, p.name, "sent", now);
    }),
  ]);

  // We already hold the bytes, so archiving outgoing attachments costs no API calls.
  for (const { file, buffer } of fileData) {
    let storagePath: string | null = null;
    if (env().ARCHIVE_ATTACHMENTS && storageEnabled()) {
      try {
        const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
        storagePath = await uploadAttachment(`${row.id}/${randomUUID()}-${file.name.replace(/[^\w.\-]+/g, "_")}`, ab, file.type || "application/octet-stream");
      } catch (err) {
        console.error("[send] attachment archive failed", err);
      }
    }
    await db().insert(attachmentsTable).values({
      emailId: row.id,
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      size: file.size,
      storagePath,
    });
  }

  await logActivity({
    type: "email.sent",
    title: `Sent "${subject}" to ${input.to[0]}${input.to.length > 1 ? ` +${input.to.length - 1}` : ""}`,
    actor: input.actor,
    emailId: row.id,
    threadId,
    projectId: identity.projectId,
  });
  return { threadId, emailId: row.id };
}
