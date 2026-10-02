import Link from "next/link";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { STATUS_STYLE } from "@/lib/status";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export const buttonStyles = {
  primary: cn(buttonBase, "bg-accent text-accent-fg hover:opacity-90 h-9 px-4"),
  secondary: cn(buttonBase, "border border-border bg-surface hover:bg-surface-2 h-9 px-3"),
  ghost: cn(buttonBase, "hover:bg-surface-2 h-8 px-2 text-muted hover:text-fg"),
  danger: cn(buttonBase, "border border-border text-danger hover:bg-danger/10 h-9 px-3"),
};

export const inputStyles =
  "w-full rounded-lg border border-border bg-surface px-3 h-9 text-sm placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-border bg-surface", className)} {...props} />;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize", STATUS_STYLE[status] ?? STATUS_STYLE.sent)}>
      {status.replace("_", " ")}
    </span>
  );
}

export function ProjectDot({ color, name }: { color?: string | null; name?: string | null }) {
  if (!name) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span className="size-2 rounded-full" style={{ background: color ?? "#888" }} />
      {name}
    </span>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: React.ReactNode; action?: { href: string; label: string } }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-16 text-center">
      <p className="font-medium">{title}</p>
      {hint && <p className="mt-1 max-w-md text-sm text-muted">{hint}</p>}
      {action && (
        <Link href={action.href} className={cn(buttonStyles.primary, "mt-4")}>
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function Meter({ value, max, warnAt }: { value: number; max: number; warnAt?: number }) {
  const pct = Math.min(100, max ? (value / max) * 100 : 0);
  const tone = value >= max ? "bg-danger" : warnAt && value >= warnAt ? "bg-amber-500" : "bg-accent";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
      <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </Card>
  );
}
