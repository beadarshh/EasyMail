import { cookies } from "next/headers";
import { connection } from "next/server";
import { Sidebar, type ShellData } from "@/components/sidebar";
import { currentAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { unreadCount } from "@/lib/queries";
import { getUsageOnce } from "@/lib/quota";

// Sidebar numbers load in the background; the shell and the page below it never wait on them.
// Access control lives in the pages (each awaits requireSession() alongside its own queries).
async function loadShell(): Promise<ShellData> {
  const e = env();
  const [admin, unread, usage] = await Promise.all([currentAdmin(), unreadCount(), getUsageOnce()]);
  return {
    username: admin?.username ?? "",
    unread,
    quota: {
      usedToday: usage.sentToday + usage.receivedToday,
      dailyCap: e.DAILY_SEND_CAP,
      warnAt: e.DAILY_WARN_AT,
      monthUsed: usage.monthUsed,
      monthlyCap: e.MONTHLY_CAP,
    },
  };
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Per-request page: never prerender.
  await connection();
  const jar = await cookies();
  return (
    <Sidebar shell={loadShell()} defaultCollapsed={jar.get("sidebar")?.value === "collapsed"}>
      {children}
    </Sidebar>
  );
}
