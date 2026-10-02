// Outbound status only moves "forward"; failures always win.
const RANK: Record<string, number> = {
  queued: 0,
  scheduled: 1,
  sent: 2,
  delivery_delayed: 3,
  delivered: 4,
  opened: 5,
  clicked: 6,
};

const TERMINAL = new Set(["bounced", "complained", "failed", "suppressed"]);

export const STATUS_FROM_EVENT: Record<string, string> = {
  "email.scheduled": "scheduled",
  "email.sent": "sent",
  "email.delivery_delayed": "delivery_delayed",
  "email.delivered": "delivered",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
  "email.suppressed": "suppressed",
};

export function nextStatus(current: string, incoming: string): string {
  if (TERMINAL.has(incoming)) {
    // A complaint is more severe than a bounce; otherwise keep the first failure.
    if (TERMINAL.has(current) && !(incoming === "complained")) return current;
    return incoming;
  }
  if (TERMINAL.has(current)) return current;
  return (RANK[incoming] ?? -1) > (RANK[current] ?? -1) ? incoming : current;
}

export const STATUS_STYLE: Record<string, string> = {
  received: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  queued: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
  scheduled: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
  sent: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
  delivery_delayed: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  delivered: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  opened: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  clicked: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  bounced: "bg-red-500/15 text-red-700 dark:text-red-300",
  complained: "bg-red-500/15 text-red-700 dark:text-red-300",
  failed: "bg-red-500/15 text-red-700 dark:text-red-300",
  suppressed: "bg-red-500/15 text-red-700 dark:text-red-300",
};
