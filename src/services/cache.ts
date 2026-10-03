import "server-only";
import { revalidateTag } from "next/cache";

/** Data-cache tags. Anything cached under a tag is refreshed by invalidate(tag). */
export const TAG = {
  /** Dashboard stats + recent activity. */
  dashboard: "dashboard",
  /** Sidebar numbers (unread badge, quota meters). */
  shell: "shell",
} as const;

type Tag = (typeof TAG)[keyof typeof TAG];

/** Marks cached data stale right now. Safe to call anywhere; never throws. */
export function invalidate(...tags: Tag[]) {
  for (const t of tags) {
    try {
      revalidateTag(t, { expire: 0 });
    } catch (err) {
      // Outside a request scope (scripts, tests) there is no cache to refresh.
      console.warn("[cache] could not invalidate", t, (err as Error).message);
    }
  }
}
