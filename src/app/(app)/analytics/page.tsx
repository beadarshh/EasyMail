import type { Metadata } from "next";
import Link from "next/link";
import { HourChart, VolumeChart } from "@/components/charts";
import { ProjectTable } from "@/components/project-table";
import { Card, cn, PageHeader, Stat } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { DISPLAY_TZ, rate } from "@/lib/format";
import { analytics } from "@/services/analytics.service";
import { listProjects } from "@/services/project.service";

export const metadata: Metadata = { title: "Analytics" };

type SP = Promise<Record<string, string | undefined>>;
const RANGES = [7, 14, 30];
const DEFAULT_DAYS = 14;

export default async function AnalyticsPage({ searchParams }: { searchParams: SP }) {
  const params = await searchParams;
  const days = RANGES.includes(Number(params.days)) ? Number(params.days) : DEFAULT_DAYS;
  const projectId = params.project;
  // Stats come from the data cache (refreshed when something is logged),
  // so reloading the page or flipping filters doesn't re-run the queries.
  const [, projects, stats] = await Promise.all([requireSession(), listProjects(), analytics({ days, projectId })]);
  const t = stats.totals;
  const project = projects.find((p) => p.id === projectId);
  const funnel = [
    { label: "Sent", n: t.sent },
    { label: "Delivered", n: t.delivered },
    { label: "Opened", n: t.opened },
    { label: "Clicked", n: t.clicked },
  ];

  const link = (patch: Record<string, string | undefined>) => {
    const qs = new URLSearchParams(
      Object.entries({ days: String(days), project: projectId, ...patch }).filter(
        (e): e is [string, string] => !!e[1] && !(e[0] === "days" && e[1] === String(DEFAULT_DAYS)),
      ),
    ).toString();
    return qs ? `/analytics?${qs}` : "/analytics";
  };
  const chip = (active: boolean) =>
    cn("rounded-full border px-3 py-1 text-xs transition-colors", active ? "border-accent bg-accent/10 text-fg" : "border-border text-muted hover:text-fg");

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle={`Last ${days} days · ${project ? project.name : "all projects"}. Computed from your own database: zero Resend API calls.`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <Link key={r} href={link({ days: String(r) })} className={chip(r === days)}>
            {r} days
          </Link>
        ))}
        {projects.length > 0 && (
          <>
            <span className="mx-1 h-4 w-px bg-border" />
            <Link href={link({ project: undefined })} className={chip(!projectId)}>
              All projects
            </Link>
            {projects.map((p) => (
              <Link key={p.id} href={link({ project: p.id })} className={cn(chip(p.id === projectId), "inline-flex items-center gap-1.5")}>
                <span className="size-2 rounded-full" style={{ background: p.color }} />
                {p.name}
              </Link>
            ))}
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Sent" value={t.sent} />
        <Stat label="Received" value={t.received} />
        <Stat label="Delivered" value={rate(t.delivered, t.sent)} hint={`${t.delivered} emails`} />
        <Stat label="Opened" value={rate(t.opened, t.delivered || t.sent)} hint={`Clicked: ${rate(t.clicked, t.delivered || t.sent)}`} />
        <Stat label="Bounced / spam" value={rate(t.bounced + t.complained, t.sent)} hint={`${t.bounced} bounced · ${t.complained} complaints`} />
      </div>

      <Card className="mt-4 p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium">Volume per day (UTC)</h2>
          <span className="text-xs text-muted tabular-nums">
            {t.sent} sent · {t.received} received
          </span>
        </div>
        <VolumeChart data={stats.series} />
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-muted">Show as table</summary>
          <table className="mt-2 w-full max-w-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="font-medium">Day</th>
                <th className="text-right font-medium">Sent</th>
                <th className="text-right font-medium">Received</th>
              </tr>
            </thead>
            <tbody>
              {stats.series.map((d) => (
                <tr key={d.day}>
                  <td className="tabular-nums">{d.day}</td>
                  <td className="text-right tabular-nums">{d.sent}</td>
                  <td className="text-right tabular-nums">{d.received}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Card>

      <Card className="mt-4 p-4">
        <h2 className="mb-3 text-sm font-medium">Delivery funnel</h2>
        <ul className="space-y-2.5 text-sm">
          {funnel.map((step) => (
            <li key={step.label}>
              <div className="mb-1 flex justify-between text-xs">
                <span>{step.label}</span>
                <span className="tabular-nums text-muted">
                  {step.n} · {rate(step.n, t.sent)}
                </span>
              </div>
              <div className="h-2 rounded-full bg-surface-2">
                <div className="h-2 rounded-full bg-accent" style={{ width: `${t.sent ? Math.min(100, (step.n / t.sent) * 100) : 0}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="mt-4 p-4">
        <h2 className="mb-3 text-sm font-medium">By project</h2>
        <ProjectTable rows={stats.byProject} />
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-medium">Top contacts</h2>
          {stats.topContacts.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="pb-2 font-medium">Address</th>
                  <th className="pb-2 text-right font-medium">Sent to</th>
                  <th className="pb-2 text-right font-medium">From</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stats.topContacts.map((c) => (
                  <tr key={c.address}>
                    <td className="max-w-0 truncate py-1.5 pr-3">{c.address}</td>
                    <td className="py-1.5 text-right tabular-nums">{c.sent}</td>
                    <td className="py-1.5 text-right tabular-nums">{c.received}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted">No contacts in this period.</p>
          )}
        </Card>
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-medium">Most clicked links</h2>
          {stats.topLinks.length ? (
            <ul className="divide-y divide-border text-sm">
              {stats.topLinks.map((l) => (
                <li key={l.link} className="flex gap-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate">{l.link}</span>
                  <span className="tabular-nums text-muted">{l.clicks}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No clicks tracked. Enable click tracking on your Resend domain.</p>
          )}
        </Card>
      </div>

      <Card className="mt-4 p-4">
        <h2 className="mb-3 text-sm font-medium">Mail received by hour ({DISPLAY_TZ})</h2>
        <HourChart data={stats.hourly} tz={DISPLAY_TZ} />
      </Card>
    </>
  );
}
