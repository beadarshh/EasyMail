import type { Metadata } from "next";
import Link from "next/link";
import { ActivityFeed } from "@/components/activity-feed";
import { VolumeChart } from "@/components/charts";
import { EmailList } from "@/components/email-list";
import { ProjectTable } from "@/components/project-table";
import { Card, Meter, PageHeader, Stat } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { rate } from "@/lib/format";
import { recentActivity } from "@/services/activity.service";
import { analytics } from "@/services/analytics.service";
import { latestEmails } from "@/services/mail.service";
import { getUsageOnce } from "@/services/quota.service";

export const metadata: Metadata = { title: "Dashboard" };

// The overview. Filters, rates over time, contacts, links and hours live on /analytics.
// Everything except the usage meters comes from the data cache (refreshed when something is logged).
export default async function Dashboard() {
  const e = env();
  const [, usage, stats, inbox, sent, activity] = await Promise.all([
    requireSession(),
    getUsageOnce(),
    analytics({ days: 14 }),
    latestEmails("inbound"),
    latestEmails("outbound"),
    recentActivity(15),
  ]);
  const usedToday = usage.sentToday + usage.receivedToday;
  const t = stats.totals;

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Last 14 days across all projects."
        actions={
          <Link href="/analytics" className="text-sm text-accent">
            Analytics →
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Today (UTC)"
          value={`${usedToday} / ${e.DAILY_SEND_CAP}`}
          hint={
            <div className="space-y-1.5">
              <Meter value={usedToday} max={e.DAILY_SEND_CAP} warnAt={e.DAILY_WARN_AT} />
              <span>
                {usage.sentToday} sent · {usage.receivedToday} received
              </span>
            </div>
          }
        />
        <Stat
          label="This month"
          value={`${usage.monthUsed} / ${e.MONTHLY_CAP}`}
          hint={
            <div className="space-y-1.5">
              <Meter value={usage.monthUsed} max={e.MONTHLY_CAP} warnAt={e.MONTHLY_CAP * 0.9} />
              <span>
                {usage.monthSent} sent · {usage.monthReceived} received
              </span>
            </div>
          }
        />
        <Stat label="Delivery rate" value={rate(t.delivered, t.sent)} hint={`${t.delivered} of ${t.sent} sent · ${t.bounced} bounced`} />
        <Stat label="Open rate" value={rate(t.opened, t.delivered || t.sent)} hint={`${t.clicked} emails clicked`} />
      </div>

      <Card className="mt-4 p-4">
        <h2 className="mb-3 text-sm font-medium">Volume per day (UTC)</h2>
        <VolumeChart data={stats.series} />
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium">Latest received</h2>
            <Link href="/inbox" className="text-xs text-accent">
              Inbox →
            </Link>
          </div>
          {inbox.length ? <EmailList rows={inbox} mode="inbound" /> : <Card className="p-4 text-sm text-muted">Nothing received yet.</Card>}
        </section>
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium">Latest sent</h2>
            <Link href="/sent" className="text-xs text-accent">
              Sent →
            </Link>
          </div>
          {sent.length ? <EmailList rows={sent} mode="outbound" /> : <Card className="p-4 text-sm text-muted">Nothing sent yet.</Card>}
        </section>
      </div>

      <Card className="mt-4 p-4">
        <h2 className="mb-3 text-sm font-medium">By project</h2>
        <ProjectTable rows={stats.byProject} />
      </Card>

      <Card className="mt-4 p-4">
        <h2 className="mb-3 text-sm font-medium">Recent activity</h2>
        <ActivityFeed rows={activity} />
      </Card>
    </>
  );
}
