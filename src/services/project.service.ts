import "server-only";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { emails, identities, projects } from "@/db/schema";
import { logActivity } from "./activity.service";
import { invalidate, TAG } from "./cache";
import { db, readDb } from "./supabase";

// ─── Projects ───────────────────────────────────────────────────────────

export async function listProjects() {
  return readDb(() => db().select().from(projects).orderBy(asc(projects.name)));
}

export async function getProject(id: string) {
  const [row] = await readDb(() => db().select().from(projects).where(eq(projects.id, id)));
  return row ?? null;
}

export async function findProjectIdBySlug(slug: string) {
  const [p] = await readDb(() => db().select({ id: projects.id }).from(projects).where(eq(projects.slug, slug)));
  return p?.id ?? null;
}

/** Throws on a duplicate slug (unique constraint). */
export async function createProject(input: { name: string; slug: string; color: string }, actor?: string) {
  const [row] = await db().insert(projects).values(input).returning({ id: projects.id });
  await logActivity({ type: "project.created", title: `Created project "${input.name}"`, actor, projectId: row.id });
  invalidate(TAG.dashboard);
}

export async function deleteProject(id: string, actor?: string) {
  const [gone] = await db().delete(projects).where(eq(projects.id, id)).returning({ name: projects.name });
  if (gone) await logActivity({ type: "project.deleted", title: `Deleted project "${gone.name}"`, actor });
  invalidate(TAG.dashboard);
}

// ─── Identities (From / receive addresses) ──────────────────────────────

export async function listIdentities() {
  return readDb(() =>
    db()
      .select({ identity: identities, projectName: projects.name, projectColor: projects.color })
      .from(identities)
      .leftJoin(projects, eq(projects.id, identities.projectId))
      .orderBy(asc(identities.address)),
  );
}

export async function getIdentity(id: string) {
  const [row] = await readDb(() => db().select().from(identities).where(eq(identities.id, id)));
  return row ?? null;
}

/** Map an address we own to its identity (and therefore project). */
export async function findIdentity(addresses: string[], kind: "send" | "receive") {
  const list = [...new Set(addresses.map((a) => a.toLowerCase()))];
  if (!list.length) return null;
  const rows = await readDb(() =>
    db()
      .select()
      .from(identities)
      .where(and(inArray(identities.address, list), kind === "send" ? eq(identities.canSend, true) : eq(identities.canReceive, true))),
  );
  // Prefer the first matching address in the order given (e.g. To before Cc).
  return list.map((a) => rows.find((r) => r.address === a)).find(Boolean) ?? null;
}

export type NewIdentity = {
  address: string;
  displayName?: string;
  projectId?: string;
  canSend: boolean;
  canReceive: boolean;
};

/** Throws on a duplicate address (unique constraint). */
export async function createIdentity(input: NewIdentity, actor?: string) {
  await db().insert(identities).values(input);
  // Attach earlier unassigned mail from/to this address to its project.
  if (input.projectId) {
    const addr = input.address;
    await db()
      .update(emails)
      .set({ projectId: input.projectId })
      .where(
        and(
          isNull(emails.projectId),
          or(
            and(eq(emails.direction, "outbound"), eq(emails.fromAddress, addr)),
            and(eq(emails.direction, "inbound"), sql`array_to_string(${emails.to}, ',') ilike ${`%${addr}%`}`),
          ),
        ),
      );
  }
  await logActivity({ type: "identity.created", title: `Added address ${input.address}`, actor, projectId: input.projectId });
  invalidate(TAG.dashboard);
}

export async function updateIdentityProject(id: string, projectId: string | null, actor?: string) {
  const [row] = await db().update(identities).set({ projectId }).where(eq(identities.id, id)).returning({ address: identities.address });
  if (row) await logActivity({ type: "identity.updated", title: `Moved ${row.address} to another project`, actor, projectId });
  invalidate(TAG.dashboard);
}

export async function deleteIdentity(id: string, actor?: string) {
  const [row] = await db().delete(identities).where(eq(identities.id, id)).returning({ address: identities.address });
  if (row) await logActivity({ type: "identity.deleted", title: `Removed address ${row.address}`, actor });
}
