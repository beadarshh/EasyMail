import { Sidebar } from "@/components/sidebar";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { unreadCount } from "@/lib/queries";
import { getUsage } from "@/lib/quota";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireSession();
  const [unread, usage] = await Promise.all([unreadCount(), getUsage()]);
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
        <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</div>
      </main>
    </div>
  );
}
