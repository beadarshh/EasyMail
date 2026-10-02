import { connection } from "next/server";
import { Sidebar } from "@/components/sidebar";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { unreadCount } from "@/lib/queries";
import { getUsage } from "@/lib/quota";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Per-request page: never prerender, and fetch auth + data in one parallel round.
  await connection();
  const [admin, unread, usage] = await Promise.all([requireSession(), unreadCount(), getUsage()]);
  const e = env();
  return (
    <div className="min-h-screen">
      <Sidebar
        username={admin.username}
        unread={unread}
        quota={{
          usedToday: usage.sentToday + usage.receivedToday,
          dailyCap: e.DAILY_SEND_CAP,
          warnAt: e.DAILY_WARN_AT,
          monthUsed: usage.monthUsed,
          monthlyCap: e.MONTHLY_CAP,
        }}
      />
      <main className="md:pl-60">
        <div className="px-4 py-6 md:px-8 md:py-8 xl:px-10">{children}</div>
      </main>
    </div>
  );
}
