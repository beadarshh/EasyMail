import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db, emails, type Email } from "@/db";
import { ComposeForm } from "@/components/compose-form";
import { PageHeader } from "@/components/ui";
import { env } from "@/lib/env";
import { forwardSubject, replySubject } from "@/lib/mail-utils";
import { formatFull } from "@/lib/format";
import { listIdentities } from "@/lib/queries";
import { canSend } from "@/lib/quota";

export const metadata: Metadata = { title: "Compose" };

type SP = Promise<Record<string, string | undefined>>;
const UUID = /^[0-9a-f-]{36}$/i;

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function quoted(m: Email) {
  const body = m.html ?? `<p>${escapeHtml(m.text ?? "").replace(/\n/g, "<br>")}</p>`;
  const who = escapeHtml(m.fromName ? `${m.fromName} <${m.fromAddress}>` : m.fromAddress);
  return { who, body, when: formatFull(m.sentAt) };
}

export default async function ComposePage({ searchParams }: { searchParams: SP }) {
  const params = await searchParams;
  const [ids, quota] = await Promise.all([listIdentities(), canSend(1)]);
  const senders = ids.filter((i) => i.identity.canSend);

  const defaults: Parameters<typeof ComposeForm>[0]["defaults"] = { to: params.to };
  const sourceId = params.reply ?? params.forward;
  let title = "New message";

  if (sourceId && UUID.test(sourceId)) {
    const [m] = await db().select().from(emails).where(eq(emails.id, sourceId));
    if (m) {
      const q = quoted(m);
      // Reply from the address that received the mail (or sent it, for outbound).
      const own = m.direction === "inbound" ? senders.find((s) => s.identity.id === m.identityId) : senders.find((s) => s.identity.address === m.fromAddress);
      defaults.identityId = own?.identity.id;
      if (params.reply) {
        title = "Reply";
        defaults.replyToEmailId = m.id;
        defaults.subject = replySubject(m.subject);
        defaults.to = m.direction === "inbound" ? (m.replyTo[0] ?? m.fromAddress) : m.to.join(", ");
        defaults.html = `<p></p><p>On ${q.when}, ${q.who} wrote:</p><blockquote>${q.body}</blockquote>`;
      } else {
        title = "Forward";
        defaults.subject = forwardSubject(m.subject);
        defaults.html = `<p></p><p>---------- Forwarded message ----------<br>From: ${q.who}<br>Date: ${q.when}<br>Subject: ${escapeHtml(m.subject)}</p>${q.body}`;
      }
    }
  }

  return (
    <>
      <PageHeader title={title} subtitle={`${quota.remainingToday} sends left today · ${quota.remainingMonth} this month`} />
      <ComposeForm
        key={sourceId ?? "new"}
        identities={senders.map((s) => ({
          id: s.identity.id,
          label: `${s.identity.displayName ? `${s.identity.displayName} <${s.identity.address}>` : s.identity.address}${s.projectName ? ` · ${s.projectName}` : ""}`,
        }))}
        defaults={defaults}
        quota={{ allowed: quota.allowed, level: quota.level, remainingToday: quota.remainingToday, remainingMonth: quota.remainingMonth, reason: quota.reason }}
        maxAttachmentMb={env().MAX_ATTACHMENT_MB}
      />
      {params.forward && <p className="mt-3 text-xs text-muted">Original attachments aren&apos;t re-attached when forwarding. Download and attach them if needed.</p>}
    </>
  );
}
