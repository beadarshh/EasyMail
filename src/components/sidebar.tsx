"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BarChart3, FolderKanban, Inbox, LayoutDashboard, LogOut, Menu, PenSquare, Send, Settings, X } from "lucide-react";
import { logout } from "@/app/login/actions";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { buttonStyles, cn, Meter } from "./ui";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inbox", label: "Inbox", icon: Inbox, badge: "unread" as const },
  { href: "/sent", label: "Sent", icon: Send },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/settings", label: "Settings", icon: Settings },
];

type Props = {
  username: string;
  unread: number;
  quota: { usedToday: number; dailyCap: number; warnAt: number; monthUsed: number; monthlyCap: number };
};

export function Sidebar({ username, unread, quota }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex h-full flex-col gap-1 p-3">
      <div className="mb-4 flex items-center gap-2 px-2 pt-1">
        <Logo />
        <span className="font-semibold tracking-tight">EasyMail</span>
      </div>
      <Link href="/compose" onClick={() => setOpen(false)} className={cn(buttonStyles.primary, "mb-3 w-full")}>
        <PenSquare className="size-4" /> Compose
      </Link>
      {NAV.map(({ href, label, icon: Icon, badge }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              active ? "bg-surface-2 font-medium text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            <Icon className="size-4" />
            <span className="flex-1">{label}</span>
            {badge === "unread" && unread > 0 && (
              <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-fg tabular-nums">{unread}</span>
            )}
          </Link>
        );
      })}

      <div className="mt-auto space-y-3 rounded-lg border border-border p-3 text-xs">
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
      <ThemeToggle className="mt-2 w-full" />
      <form action={logout} className="flex items-center gap-2 pl-3">
        <span className="min-w-0 flex-1 truncate text-xs text-muted" title={`Signed in as ${username}`}>
          {username}
        </span>
        <button className={buttonStyles.ghost} aria-label="Sign out" title="Sign out">
          <LogOut className="size-4" />
        </button>
      </form>
    </nav>
  );

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-surface px-4 py-3 md:hidden">
        <button aria-label="Open menu" onClick={() => setOpen(true)} className={buttonStyles.ghost}>
          <Menu className="size-5" />
        </button>
        <Logo />
        <span className="font-semibold">EasyMail</span>
      </header>
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-border bg-surface md:block">{nav}</aside>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-border bg-surface">
            <button aria-label="Close menu" onClick={() => setOpen(false)} className={cn(buttonStyles.ghost, "absolute right-2 top-3")}>
              <X className="size-4" />
            </button>
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}
