import "server-only";
import { eq, sql } from "drizzle-orm";
import { contacts, db, settings } from "@/db";

export async function getSetting<T>(key: string): Promise<T | null> {
  const [row] = await db().select().from(settings).where(eq(settings.key, key));
  return (row?.value as T) ?? null;
}

export async function setSetting(key: string, value: unknown) {
  await db()
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}

export async function touchContact(address: string, name: string | null, kind: "sent" | "received", at: Date) {
  const addr = address.toLowerCase();
  await db()
    .insert(contacts)
    .values({
      address: addr,
      name,
      firstSeen: at,
      lastSeen: at,
      sentCount: kind === "sent" ? 1 : 0,
      receivedCount: kind === "received" ? 1 : 0,
    })
    .onConflictDoUpdate({
      target: contacts.address,
      set: {
        name: sql`coalesce(${contacts.name}, ${name})`,
        lastSeen: sql`greatest(${contacts.lastSeen}, ${at.toISOString()}::timestamptz)`,
        sentCount: kind === "sent" ? sql`${contacts.sentCount} + 1` : contacts.sentCount,
        receivedCount: kind === "received" ? sql`${contacts.receivedCount} + 1` : contacts.receivedCount,
      },
    });
}

export async function deleteSetting(key: string) {
  await db().delete(settings).where(eq(settings.key, key));
}
