import { cookies } from "next/headers";
import { connection } from "next/server";
import { Sidebar, type ShellData } from "@/components/sidebar";
import { currentAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { unreadCount } from "@/services/mail.service";
import { getUsageOnce } from "@/services/quota.service";

// Sidebar numbers load in the background; the shell and the page below it never wait on them.
// Access control lives in the pages (each awaits requireSession() alongside its own queries).
// This promise must never reject: the sidebar reads it with use(), and a rejection there would
// take down the whole page. On any failure the sidebar just shows empty numbers.
async function loadShell(): Promise<ShellData> {
  const e = env();
  const quota = { usedToday: 0, dailyCap: e.DAILY_SEND_CAP, warnAt: e.DAILY_WARN_AT, monthUsed: 0, monthlyCap: e.MONTHLY_CAP };
  try {
    const [admin, unread, usage] = await Promise.all([currentAdmin(), unreadCount(), getUsageOnce()]);
    return {
      username: admin?.username ?? "",
      unread,
      quota: { ...quota, usedToday: usage.sentToday + usage.receivedToday, monthUsed: usage.monthUsed },
    };
  } catch (err) {
    console.error("[layout] sidebar data failed", (err as Error).message);
    return { username: "", unread: 0, quota };
  }
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
