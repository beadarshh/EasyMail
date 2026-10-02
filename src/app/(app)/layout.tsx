import { cookies } from "next/headers";
import { connection } from "next/server";
import { Sidebar } from "@/components/sidebar";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { unreadCount } from "@/lib/queries";
import { getUsage } from "@/lib/quota";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Per-request page: never prerender, and fetch auth + data in one parallel round.
  await connection();
  const [admin, unread, usage, jar] = await Promise.all([requireSession(), unreadCount(), getUsage(), cookies()]);
  const e = env();
  return (
    <Sidebar
      username={admin.username}
      unread={unread}
      defaultCollapsed={jar.get("sidebar")?.value === "collapsed"}
      quota={{
        usedToday: usage.sentToday + usage.receivedToday,
        dailyCap: e.DAILY_SEND_CAP,
        warnAt: e.DAILY_WARN_AT,
        monthUsed: usage.monthUsed,
        monthlyCap: e.MONTHLY_CAP,
      }}
    >
      {children}
    </Sidebar>
  );
}
