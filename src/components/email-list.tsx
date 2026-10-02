import Link from "next/link";
import { Paperclip, Star } from "lucide-react";
import type { EmailRow } from "@/lib/queries";
import { cn, ProjectDot, StatusBadge } from "./ui";
import { formatWhen } from "@/lib/format";

export function EmailList({ rows, mode }: { rows: EmailRow[]; mode: "inbound" | "outbound" }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
      {rows.map((r) => {
        const who = mode === "inbound" ? r.fromName || r.fromAddress : `To: ${r.to.join(", ")}`;
        const unread = mode === "inbound" && !r.isRead;
        return (
          <li key={r.id}>
            <Link
              href={`/thread/${r.threadId}#${r.id}`}
              className="flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-4"
            >
              <div className="flex min-w-0 items-center gap-2 sm:w-56 sm:shrink-0">
                {unread && <span className="size-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
                {r.isStarred && <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" />}
                <span className={cn("truncate text-sm", unread ? "font-semibold" : "text-fg")}>{who}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  <span className={cn(unread && "font-semibold")}>{r.subject || "(no subject)"}</span>
                  <span className="text-muted"> — {r.snippet}</span>
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <ProjectDot name={r.projectName} color={r.projectColor} />
                {r.hasAttachments && <Paperclip className="size-3.5 text-muted" />}
                {mode === "outbound" && (
                  <>
                    {r.source === "external" && <span className="text-[11px] text-muted">via API</span>}
                    <StatusBadge status={r.status} />
                  </>
                )}
                <time className="w-16 text-right text-xs text-muted tabular-nums" dateTime={r.sentAt.toISOString()}>
                  {formatWhen(r.sentAt)}
                </time>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
