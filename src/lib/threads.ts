import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, emails, identities } from "@/db";
import { normalizeMessageId } from "./mail-utils";

/** Reuse the thread of any email whose Message-ID appears in In-Reply-To/References. */
export async function resolveThreadId(relatedIds: (string | null | undefined)[]) {
  const ids = [...new Set(relatedIds.map(normalizeMessageId).filter((x): x is string => !!x))];
  if (ids.length) {
    const [hit] = await db()
      .select({ threadId: emails.threadId })
      .from(emails)
      .where(inArray(emails.messageId, ids))
      .orderBy(desc(emails.sentAt))
      .limit(1);
    if (hit) return hit.threadId;
  }
  return randomUUID();
}

/** Map an address we own to its identity (and therefore project). */
export async function findIdentity(addresses: string[], kind: "send" | "receive") {
  const list = [...new Set(addresses.map((a) => a.toLowerCase()))];
  if (!list.length) return null;
  const rows = await db()
    .select()
    .from(identities)
    .where(
      and(
        inArray(identities.address, list),
        kind === "send" ? eq(identities.canSend, true) : eq(identities.canReceive, true),
      ),
    );
  // Prefer the first matching address in the order given (e.g. To before Cc).
  return list.map((a) => rows.find((r) => r.address === a)).find(Boolean) ?? null;
}
