import type { Metadata } from "next";
import Link from "next/link";
import { VolumeChart } from "@/components/charts";
import { EmailList } from "@/components/email-list";
import { ProjectTable } from "@/components/project-table";
import { Card, Meter, PageHeader, Stat } from "@/components/ui";
import { env } from "@/lib/env";
import { analytics, listEmails, rate } from "@/lib/queries";
import { getUsage } from "@/lib/quota";

export const metadata: Metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const e = env();
  const [usage, stats, inbox, sent] = await Promise.all([
    getUsage(),
    analytics({ days: 14 }),
    listEmails({ direction: "inbound" }),
    listEmails({ direction: "outbound" }),
  ]);
  const usedToday = usage.sentToday + usage.receivedToday;
  const t = stats.totals;

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Last 14 days across all projects." />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium">Latest received</h2>
            <Link href="/inbox" className="text-xs text-accent">
              Inbox →
            </Link>
          </div>
          {inbox.rows.length ? <EmailList rows={inbox.rows.slice(0, 5)} mode="inbound" /> : <Card className="p-4 text-sm text-muted">Nothing received yet.</Card>}
        </section>
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-medium">Latest sent</h2>
            <Link href="/sent" className="text-xs text-accent">
              Sent →
            </Link>
          </div>
          {sent.rows.length ? <EmailList rows={sent.rows.slice(0, 5)} mode="outbound" /> : <Card className="p-4 text-sm text-muted">Nothing sent yet.</Card>}
        </section>
      </div>

      <Card className="mt-4 p-4">
        <h2 className="mb-3 text-sm font-medium">By project</h2>
        <ProjectTable rows={stats.byProject} />
      </Card>
    </>
  );
}
