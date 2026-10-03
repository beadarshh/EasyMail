import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { apiKeys, identities, projects } from "@/db/schema";
import { generateApiKey, hashApiKey } from "@/lib/api-keys";
import { logActivity } from "./activity.service";
import { db, readDb } from "./supabase";

export type NewApiKey = { name: string; projectId: string; identityId: string; toAddress: string; allowedOrigins: string[] };

/** Returns the raw key. It cannot be recovered later: only its hash is stored. */
export async function createApiKey(input: NewApiKey, actor?: string) {
  const { key, hash, prefix } = generateApiKey();
  await db().insert(apiKeys).values({ ...input, keyHash: hash, keyPrefix: prefix });
  await logActivity({
    type: "apikey.created",
    title: `Created API key "${input.name}" for ${input.allowedOrigins.join(", ")}`,
    actor,
    projectId: input.projectId,
  });
  return key;
}

export async function listApiKeys() {
  return readDb(() =>
    db()
      .select({ key: apiKeys, projectName: projects.name, fromAddress: identities.address })
      .from(apiKeys)
      .leftJoin(projects, eq(projects.id, apiKeys.projectId))
      .leftJoin(identities, eq(identities.id, apiKeys.identityId))
      .orderBy(desc(apiKeys.createdAt)),
  );
}

export async function revokeApiKey(id: string, actor?: string) {
  const [row] = await db()
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), isNull(apiKeys.revokedAt)))
    .returning({ name: apiKeys.name, projectId: apiKeys.projectId });
  if (row) await logActivity({ type: "apikey.revoked", title: `Revoked API key "${row.name}"`, actor, projectId: row.projectId });
}

/** The active key for a raw value, with its project name and sender address; null if unknown or revoked. */
export async function findActiveKey(raw: string) {
  const [row] = await readDb(() =>
    db()
      .select({ key: apiKeys, projectName: projects.name, fromAddress: identities.address })
      .from(apiKeys)
      .leftJoin(projects, eq(projects.id, apiKeys.projectId))
      .leftJoin(identities, eq(identities.id, apiKeys.identityId))
      .where(and(eq(apiKeys.keyHash, hashApiKey(raw)), isNull(apiKeys.revokedAt))),
  );
  return row ?? null;
}

export async function touchApiKey(id: string) {
  await db().update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, id));
}
