"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, use, useState } from "react";
import { BarChart3, ChevronLeft, FolderKanban, Inbox, LayoutDashboard, LogOut, Menu, PenSquare, Send, Settings, X } from "lucide-react";
import { logout } from "@/app/login/actions";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { buttonStyles, cn, Meter } from "./ui";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/inbox", label: "Inbox", icon: Inbox, badge: "unread" as const },
  { href: "/sent", label: "Sent", icon: Send },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/settings", label: "Settings", icon: Settings },
];

// One curve for the rail, the labels and the page padding so they move as one.
const EASE = "duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none";

type Quota = { usedToday: number; dailyCap: number; warnAt: number; monthUsed: number; monthlyCap: number };
export type ShellData = { username: string; unread: number; quota: Quota };

type Props = {
  /** Streamed from the server so the sidebar paints before the database answers. */
  shell: Promise<ShellData>;
  defaultCollapsed: boolean;
  children: React.ReactNode;
};

function UnreadBadge({ shell, collapsed, labelClass, ease }: { shell: Promise<ShellData>; collapsed: boolean; labelClass: string; ease: string }) {
  const { unread } = use(shell);
  if (unread <= 0) return null;
  return (
    <>
      <span className={cn("rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-fg tabular-nums", labelClass)}>{unread}</span>
      <span
        className={cn("absolute left-[1.55rem] top-1.5 size-2 rounded-full bg-accent ring-2 ring-surface transition-opacity", ease, collapsed ? "opacity-100" : "opacity-0")}
        aria-hidden
      />
    </>
  );
}

function QuotaPanel({ shell, collapsed }: { shell: Promise<ShellData>; collapsed: boolean }) {
  const { quota } = use(shell);
  return collapsed ? (
    <div
      className="fade-in space-y-1.5 rounded-lg border border-border px-1.5 py-2 text-center"
      title={`Today: ${quota.usedToday}/${quota.dailyCap} · This month: ${quota.monthUsed}/${quota.monthlyCap}`}
    >
      <Meter value={quota.usedToday} max={quota.dailyCap} warnAt={quota.warnAt} />
      <Meter value={quota.monthUsed} max={quota.monthlyCap} warnAt={quota.monthlyCap * 0.9} />
    </div>
  ) : (
    <div className="fade-in min-w-48 space-y-3 rounded-lg border border-border p-3 text-xs">
      <div>
        <div className="mb-1 flex justify-between text-muted">
          <span>Today</span>
          <span className="tabular-nums">
            {quota.usedToday}/{quota.dailyCap}
          </span>
        </div>
        <Meter value={quota.usedToday} max={quota.dailyCap} warnAt={quota.warnAt} />
      </div>
      <div>
        <div className="mb-1 flex justify-between text-muted">
          <span>This month</span>
          <span className="tabular-nums">
            {quota.monthUsed}/{quota.monthlyCap}
          </span>
        </div>
        <Meter value={quota.monthUsed} max={quota.monthlyCap} warnAt={quota.monthlyCap * 0.9} />
      </div>
      <p className="text-[11px] leading-snug text-muted">Sent + received both count. Resets 00:00 UTC.</p>
    </div>
  );
}

function QuotaPlaceholder({ collapsed }: { collapsed: boolean }) {
  return <div className={cn("animate-pulse rounded-lg border border-border bg-surface-2", collapsed ? "h-14" : "h-40 min-w-48")} aria-hidden />;
}

function Username({ shell }: { shell: Promise<ShellData> }) {
  const { username } = use(shell);
  return (
    <span className="fade-in min-w-0 flex-1 truncate whitespace-nowrap text-xs text-muted" title={`Signed in as ${username}`}>
      {username}
    </span>
  );
}

export function Sidebar({ shell, defaultCollapsed, children }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    // Read by the (app) layout so the server renders the remembered width (no flash).
    document.cookie = `sidebar=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
  };

  // Labels stay mounted and fade while the rail clips them, so nothing jumps.
  const label = (c: boolean) => cn("truncate transition-opacity", EASE, c ? "opacity-0" : "opacity-100");

  const nav = (c: boolean) => (
    <nav className="flex h-full flex-col gap-1 overflow-x-hidden overflow-y-auto p-3">
      <div className="mb-4 flex items-center gap-2 whitespace-nowrap px-2 pt-1">
        <Logo />
        <span className={cn("font-semibold tracking-tight", label(c))}>EasyMail</span>
      </div>
      <Link
        href="/compose"
        onClick={() => setOpen(false)}
        title={c ? "Compose" : undefined}
        className={cn(buttonStyles.primary, "mb-3 w-full justify-start gap-3 whitespace-nowrap px-3.5")}
      >
        <PenSquare className="size-4 shrink-0" />
        <span className={label(c)}>Compose</span>
      </Link>
      {NAV.map(({ href, label: text, icon: Icon, badge }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            title={c ? text : undefined}
            className={cn(
              "relative flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors",
              active ? "bg-surface-2 font-medium text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className={cn("flex-1", label(c))}>{text}</span>
            {badge === "unread" && (
              <Suspense fallback={null}>
                <UnreadBadge shell={shell} collapsed={c} labelClass={label(c)} ease={EASE} />
              </Suspense>
            )}
          </Link>
        );
      })}

      <div className="mt-auto">
        <Suspense fallback={<QuotaPlaceholder collapsed={c} />}>
          <QuotaPanel shell={shell} collapsed={c} />
        </Suspense>
      </div>
      {c ? <ThemeToggle key="theme-compact" compact className="fade-in mt-2 w-full" /> : <ThemeToggle key="theme" className="fade-in mt-2 w-full min-w-48" />}
      <form action={logout} className={cn("flex items-center", c ? "justify-center" : "gap-2 pl-3")}>
        {!c && (
          <Suspense fallback={<span className="min-w-0 flex-1" />}>
            <Username shell={shell} />
          </Suspense>
        )}
        <button className={cn(buttonStyles.ghost, "shrink-0", c && "w-full")} aria-label="Sign out" title="Sign out">
          <LogOut className="size-4" />
        </button>
      </form>
    </nav>
  );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-surface px-4 py-3 md:hidden">
        <button aria-label="Open menu" onClick={() => setOpen(true)} className={buttonStyles.ghost}>
          <Menu className="size-5" />
        </button>
        <Logo />
        <span className="font-semibold">EasyMail</span>
      </header>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-20 hidden border-r border-border bg-surface transition-[width] md:block",
          EASE,
          collapsed ? "w-[68px]" : "w-60",
        )}
      >
        {nav(collapsed)}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3 top-5 grid size-6 place-items-center rounded-full border border-border bg-surface text-muted shadow-sm transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
        >
          <ChevronLeft className={cn("size-3.5 transition-transform", EASE, collapsed && "rotate-180")} />
        </button>
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-border bg-surface">
            <button aria-label="Close menu" onClick={() => setOpen(false)} className={cn(buttonStyles.ghost, "absolute right-2 top-3 z-10")}>
              <X className="size-4" />
            </button>
            {nav(false)}
          </aside>
        </div>
      )}
      <main className={cn("min-w-0 transition-[padding-left]", EASE, collapsed ? "md:pl-[68px]" : "md:pl-60")}>
        <div className="px-4 py-6 md:px-8 md:py-8 xl:px-10">{children}</div>
      </main>
    </div>
  );
}
