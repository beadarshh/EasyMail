"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { attachments as attachmentsTable, db, emails, identities, projects } from "@/db";
import { requireSession } from "@/lib/auth";
import { env, storageEnabled } from "@/lib/env";
import { touchContact } from "@/lib/kv";
import { formatAddress, isValidEmail, parseAddress, splitAddressList } from "@/lib/mail-utils";
import { canSend, recordSent } from "@/lib/quota";
import { resend, throttled } from "@/lib/resend";
import { uploadAttachment } from "@/lib/storage";

export type SendState = { error?: string } | undefined;

const schema = z.object({
  identityId: z.string().uuid({ message: "Choose a From address" }),
  to: z.array(z.string()).min(1, "Add at least one recipient").max(50),
  cc: z.array(z.string()).max(50),
  bcc: z.array(z.string()).max(50),
  subject: z.string().trim().max(998),
  html: z.string().max(2_000_000),
  replyToEmailId: z.string().uuid().optional(),
});

function htmlToText(html: string) {
  return html
    .replace(/<(br|\/p|\/div|\/li|\/h\d)>/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function sendEmail(_prev: SendState, formData: FormData): Promise<SendState> {
  await requireSession();

  const parsed = schema.safeParse({
    identityId: formData.get("identityId"),
    to: splitAddressList(String(formData.get("to") ?? "")),
    cc: splitAddressList(String(formData.get("cc") ?? "")),
    bcc: splitAddressList(String(formData.get("bcc") ?? "")),
    subject: String(formData.get("subject") ?? ""),
    html: String(formData.get("html") ?? ""),
    replyToEmailId: formData.get("replyToEmailId") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid form" };
  const input = parsed.data;

  const bad = [...input.to, ...input.cc, ...input.bcc].find((a) => !isValidEmail(a));
  if (bad) return { error: `Invalid address: ${bad}` };

  const files = formData.getAll("attachments").filter((f): f is File => f instanceof File && f.size > 0);
  const totalBytes = files.reduce((a, f) => a + f.size, 0);
  const maxMb = env().MAX_ATTACHMENT_MB;
  if (totalBytes > maxMb * 1024 * 1024) return { error: `Attachments exceed ${maxMb} MB in total` };

  const quota = await canSend(1);
  if (!quota.allowed) return { error: quota.reason };

  const [identity] = await db().select().from(identities).where(eq(identities.id, input.identityId));
  if (!identity?.canSend) return { error: "That From address can't send" };
  const [project] = identity.projectId
    ? await db().select().from(projects).where(eq(projects.id, identity.projectId))
    : [];

  // Threading: continue the parent's conversation in both EasyMail and the recipient's client.
  let threadId: string = randomUUID();
  let inReplyTo: string | null = null;
  let references: string[] = [];
  const headers: Record<string, string> = {};
  if (input.replyToEmailId) {
    const [parent] = await db().select().from(emails).where(eq(emails.id, input.replyToEmailId));
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

  const fileData = await Promise.all(
    files.map(async (f) => ({ file: f, buffer: Buffer.from(await f.arrayBuffer()) })),
  );
  const html = input.html;
  const text = htmlToText(html);
  const from = formatAddress(identity.displayName, identity.address);

  const { data, error } = await throttled(() =>
    resend().emails.send(
      {
        from,
        to: input.to,
        cc: input.cc.length ? input.cc : undefined,
        bcc: input.bcc.length ? input.bcc : undefined,
        subject: input.subject || "(no subject)",
        html,
        text,
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
      subject: input.subject || "(no subject)",
      text,
      html,
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

  redirect(`/thread/${threadId}#${row.id}`);
}
