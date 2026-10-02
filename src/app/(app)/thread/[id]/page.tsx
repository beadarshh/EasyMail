import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { Forward, Paperclip, Reply } from "lucide-react";
import { db, emails } from "@/db";
import { EmailFrame } from "@/components/email-frame";
import { ThreadToolbar } from "@/components/thread-toolbar";
import { buttonStyles, Card, ProjectDot, StatusBadge } from "@/components/ui";
import { formatBytes, formatFull } from "@/lib/format";
import { getThread } from "@/lib/queries";

type Params = Promise<{ id: string }>;

const UUID = /^[0-9a-f-]{36}$/i;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return { title: "Conversation" };
  const [first] = await db().select({ subject: emails.subject }).from(emails).where(eq(emails.threadId, id)).limit(1);
  return { title: first?.subject || "Conversation" };
}

const EVENT_LABEL: Record<string, string> = {
  "email.sent": "Accepted by Resend",
  "email.scheduled": "Scheduled",
  "email.delivered": "Delivered",
  "email.delivery_delayed": "Delivery delayed",
  "email.opened": "Opened",
  "email.clicked": "Link clicked",
  "email.bounced": "Bounced",
  "email.complained": "Marked as spam",
  "email.failed": "Failed",
  "email.suppressed": "Suppressed",
  "email.received": "Received",
};

export default async function ThreadPage({ params }: { params: Params }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const thread = await getThread(id);
  if (!thread) notFound();

  const unreadIds = thread.filter((m) => m.email.direction === "inbound" && !m.email.isRead).map((m) => m.email.id);
  if (unreadIds.length) {
    await db().update(emails).set({ isRead: true }).where(inArray(emails.id, unreadIds));
  }

  const ids = thread.map((m) => m.email.id);
  const last = thread[thread.length - 1].email;
  const lastInbound = [...thread].reverse().find((m) => m.email.direction === "inbound")?.email;
  const replyTarget = lastInbound ?? last;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ThreadToolbar
          threadId={id}
          ids={ids}
          starred={thread.some((m) => m.email.isStarred)}
          archived={thread.every((m) => m.email.isArchived)}
          back={lastInbound ? "/inbox" : "/sent"}
        />
        <div className="flex gap-2">
          <Link href={`/compose?reply=${replyTarget.id}`} className={buttonStyles.secondary}>
            <Reply className="size-4" /> Reply
          </Link>
          <Link href={`/compose?forward=${last.id}`} className={buttonStyles.secondary}>
            <Forward className="size-4" /> Forward
          </Link>
        </div>
      </div>

      <h1 className="text-xl font-semibold tracking-tight">{thread[0].email.subject || "(no subject)"}</h1>

      {thread.map(({ email: m, projectName, projectColor, events, attachments }) => (
        <Card key={m.id} id={m.id} className="scroll-mt-6 overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
            <div className="min-w-0 text-sm">
              <p className="truncate">
                <span className="font-medium">{m.fromName || m.fromAddress}</span>
                {m.fromName && <span className="text-muted"> &lt;{m.fromAddress}&gt;</span>}
              </p>
              <p className="truncate text-xs text-muted">
                to {m.to.join(", ")}
                {m.cc.length > 0 && <> · cc {m.cc.join(", ")}</>}
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted">
              <ProjectDot name={projectName} color={projectColor} />
              {m.direction === "outbound" && <StatusBadge status={m.status} />}
              <time dateTime={m.sentAt.toISOString()}>{formatFull(m.sentAt)}</time>
            </div>
          </div>

          <div className="p-4">
            {m.source === "external" && m.direction === "outbound" && !m.html && !m.text ? (
              <p className="text-sm text-muted">
                Sent by one of your apps through the Resend API. EasyMail tracks its delivery and engagement; the body isn&apos;t
                stored, to save API calls.
              </p>
            ) : (
              <EmailFrame html={m.html} text={m.text} />
            )}

            {attachments.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {attachments.map((a) => (
                  <a
                    key={a.id}
                    href={`/api/attachments/${a.id}`}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs hover:bg-surface-2"
                  >
                    <Paperclip className="size-3.5 text-muted" />
                    <span className="max-w-48 truncate">{a.filename}</span>
                    <span className="text-muted">{formatBytes(a.size)}</span>
                    {!a.storagePath && <span className="text-amber-600" title="Not archived: available from Resend for 30 days">•</span>}
                  </a>
                ))}
              </div>
            )}
          </div>

          {m.direction === "outbound" && events.length > 0 && (
            <div className="border-t border-border bg-surface-2/50 px-4 py-3">
              <p className="mb-2 text-xs font-medium text-muted">
                Activity · {m.opens} opens · {m.clicks} clicks
              </p>
              <ol className="space-y-1 text-xs">
                {events.map((e) => (
                  <li key={e.id} className="flex flex-wrap gap-x-3">
                    <time className="w-44 shrink-0 text-muted tabular-nums">{formatFull(e.occurredAt)}</time>
                    <span>{EVENT_LABEL[e.type] ?? e.type}</span>
                    {e.type === "email.clicked" && (
                      <span className="truncate text-muted">{String((e.meta as { click?: { link?: string } })?.click?.link ?? "")}</span>
                    )}
                    {e.type === "email.bounced" && (
                      <span className="truncate text-danger">{String((e.meta as { bounce?: { message?: string } })?.bounce?.message ?? "")}</span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
