import "server-only";
import { asc, count, eq, sql } from "drizzle-orm";
import { admins, type Admin } from "@/db/schema";
import { logActivity } from "./activity.service";
import { db, readDb } from "./supabase";

export async function adminCount() {
  const [r] = await readDb(() => db().select({ n: count() }).from(admins));
  return r?.n ?? 0;
}

export async function getAdminById(id: string): Promise<Admin | null> {
  const [admin] = await readDb(() => db().select().from(admins).where(eq(admins.id, id)));
  return admin ?? null;
}

export async function getAdminByUsername(username: string): Promise<Admin | null> {
  const [admin] = await readDb(() => db().select().from(admins).where(eq(admins.username, username)));
  return admin ?? null;
}

export async function listAdmins() {
  return readDb(() =>
    db()
      .select({ id: admins.id, username: admins.username, lastLoginAt: admins.lastLoginAt })
      .from(admins)
      .orderBy(asc(admins.createdAt)),
  );
}

/** Throws on a duplicate username (unique constraint). */
export async function createAdmin(username: string, passwordHash: string, actor: string) {
  await db().insert(admins).values({ username, passwordHash });
  await logActivity({ type: "admin.created", title: `Created admin "${username}"`, actor });
}

/** First-run setup. Returns null (and removes the row) if two setups raced and this one lost. */
export async function createFirstAdmin(username: string, passwordHash: string): Promise<Admin | null> {
  const [admin] = await db().insert(admins).values({ username, passwordHash, lastLoginAt: new Date() }).returning();
  if ((await adminCount()) > 1) {
    await db().delete(admins).where(eq(admins.id, admin.id));
    return null;
  }
  await logActivity({ type: "auth.setup", title: `Created the first admin "${username}"`, actor: username });
  return admin;
}

export async function touchLastLogin(admin: Pick<Admin, "id" | "username">) {
  await db().update(admins).set({ lastLoginAt: new Date() }).where(eq(admins.id, admin.id));
  await logActivity({ type: "auth.login", title: `${admin.username} signed in`, actor: admin.username });
}

export async function logFailedLogin(username: string) {
  await logActivity({ type: "auth.login_failed", title: `Failed sign-in attempt for "${username.slice(0, 40)}"` });
}

export async function logLogout(username: string) {
  await logActivity({ type: "auth.logout", title: `${username} signed out`, actor: username });
}

/** Sets a new password and bumps the session version so other devices are signed out. */
export async function setPassword(id: string, passwordHash: string): Promise<Admin> {
  const [updated] = await db()
    .update(admins)
    .set({ passwordHash, sessionVersion: sql`${admins.sessionVersion} + 1` })
    .where(eq(admins.id, id))
    .returning();
  await logActivity({ type: "auth.password_changed", title: `${updated.username} changed their password`, actor: updated.username });
  return updated;
}

export async function deleteAdmin(id: string, actor: string) {
  const [gone] = await db().delete(admins).where(eq(admins.id, id)).returning({ username: admins.username });
  if (gone) await logActivity({ type: "admin.deleted", title: `Removed admin "${gone.username}"`, actor });
}
