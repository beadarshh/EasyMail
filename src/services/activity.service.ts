import "server-only";
import { desc, eq, lt } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { activityLog, projects } from "@/db/schema";
import { invalidate, TAG } from "./cache";
import { db, readDb } from "./supabase";

export type ActivityType =
  | "email.sent"
  | "email.received"
  | "email.delivered"
  | "email.opened"
  | "email.clicked"
  | "email.bounced"
  | "email.complained"
  | "email.failed"
  | "email.suppressed"
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout"
  | "auth.setup"
  | "auth.password_changed"
  | "admin.created"
  | "admin.deleted"
  | "project.created"
  | "project.deleted"
  | "identity.created"
  | "identity.updated"
  | "identity.deleted"
  | "thread.deleted"
  | "webhook.connected"
  | "webhook.rotated"
  | "webhook.disconnected"
  | "usage.synced"
  | "status.refreshed";

export type ActivityInput = {
  type: ActivityType;
  title: string;
  actor?: string | null;
  emailId?: string | null;
  threadId?: string | null;
  projectId?: string | null;
  meta?: Record<string, unknown>;
};

/**
 * Records one event. Best effort by design: a logging problem (e.g. the migration hasn't been
 * applied yet) must never break sending mail, logging in or processing a webhook.
 */
export async function logActivity(a: ActivityInput) {
  try {
    await db()
      .insert(activityLog)
      .values({
        type: a.type,
        title: a.title.slice(0, 300),
        actor: a.actor ?? null,
        emailId: a.emailId ?? null,
        threadId: a.threadId ?? null,
        projectId: a.projectId ?? null,
        meta: a.meta ?? null,
      });
    invalidate(TAG.dashboard);
  } catch (err) {
    console.error("[activity] could not log", a.type, (err as Error).message);
  }
}

export type ActivityRow = {
  id: string;
  type: string;
  title: string;
  actor: string | null;
  threadId: string | null;
  projectName: string | null;
  projectColor: string | null;
  /** ISO string: the cache serialises Dates. */
  createdAt: string;
};

const cachedRecent = unstable_cache(
  async (limit: number): Promise<ActivityRow[]> => {
    const rows = await readDb(() =>
      db()
        .select({
          id: activityLog.id,
          type: activityLog.type,
          title: activityLog.title,
          actor: activityLog.actor,
          threadId: activityLog.threadId,
          projectName: projects.name,
          projectColor: projects.color,
          createdAt: activityLog.createdAt,
        })
        .from(activityLog)
        .leftJoin(projects, eq(projects.id, activityLog.projectId))
        .orderBy(desc(activityLog.createdAt))
        .limit(limit),
    );
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  },
  ["activity-recent"],
  // Refreshed the moment something is logged; the TTL is only a safety net.
  { tags: [TAG.dashboard], revalidate: 300 },
);

/** Latest events for the dashboard. Served from the data cache between writes. */
export async function recentActivity(limit = 20): Promise<ActivityRow[]> {
  try {
    return await cachedRecent(limit);
  } catch (err) {
    console.error("[activity] could not load", (err as Error).message);
    return [];
  }
}

/** Keeps the table small: drops entries older than `days`. Called by the daily cron. */
export async function pruneActivity(days = 90) {
  const cutoff = new Date(Date.now() - days * 86400_000);
  const deleted = await db().delete(activityLog).where(lt(activityLog.createdAt, cutoff)).returning({ id: activityLog.id });
  return deleted.length;
}
