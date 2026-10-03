import Link from "next/link";
import {
  Activity,
  AtSign,
  Ban,
  CheckCheck,
  Eye,
  FolderKanban,
  Inbox,
  KeyRound,
  LogIn,
  LogOut,
  MousePointerClick,
  RefreshCw,
  Send,
  Trash2,
  TriangleAlert,
  UserMinus,
  UserPlus,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import { formatWhen } from "@/lib/format";
import type { ActivityRow } from "@/services/activity.service";
import { cn } from "./ui";

const ICON: Record<string, LucideIcon> = {
  "email.sent": Send,
  "email.received": Inbox,
  "email.delivered": CheckCheck,
  "email.opened": Eye,
  "email.clicked": MousePointerClick,
  "email.bounced": TriangleAlert,
  "email.complained": TriangleAlert,
  "email.failed": TriangleAlert,
  "email.suppressed": Ban,
  "auth.login": LogIn,
  "auth.login_failed": TriangleAlert,
  "auth.logout": LogOut,
  "auth.setup": UserPlus,
  "auth.password_changed": KeyRound,
  "admin.created": UserPlus,
  "admin.deleted": UserMinus,
  "project.created": FolderKanban,
  "project.deleted": FolderKanban,
  "identity.created": AtSign,
  "identity.updated": AtSign,
  "identity.deleted": AtSign,
  "thread.deleted": Trash2,
  "webhook.connected": Webhook,
  "webhook.rotated": Webhook,
  "webhook.disconnected": Webhook,
  "usage.synced": RefreshCw,
  "status.refreshed": RefreshCw,
};

const WARN = new Set(["email.bounced", "email.complained", "email.failed", "email.suppressed", "auth.login_failed"]);

export function ActivityFeed({ rows }: { rows: ActivityRow[] }) {
  if (!rows.length) return <p className="text-sm text-muted">Nothing yet. Sending, receiving mail and signing in will show up here.</p>;
  return (
    <ul className="divide-y divide-border text-sm">
      {rows.map((r) => {
        const Icon = ICON[r.type] ?? Activity;
        const body = (
          <>
            <Icon className={cn("mt-0.5 size-4 shrink-0", WARN.has(r.type) ? "text-danger" : "text-muted")} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{r.title}</span>
              {(r.actor || r.projectName) && (
                <span className="block truncate text-xs text-muted">
                  {[r.actor, r.projectName].filter(Boolean).join(" · ")}
                </span>
              )}
            </span>
            <time className="shrink-0 text-xs tabular-nums text-muted" dateTime={r.createdAt}>
              {formatWhen(new Date(r.createdAt))}
            </time>
          </>
        );
        return (
          <li key={r.id}>
            {r.threadId ? (
              <Link href={`/thread/${r.threadId}`} className="-mx-2 flex gap-3 rounded-md px-2 py-2 hover:bg-surface-2">
                {body}
              </Link>
            ) : (
              <div className="-mx-2 flex gap-3 px-2 py-2">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
