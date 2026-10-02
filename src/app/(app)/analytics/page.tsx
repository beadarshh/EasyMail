import type { Metadata } from "next";
import Link from "next/link";
import { HourChart, VolumeChart } from "@/components/charts";
import { ProjectTable } from "@/components/project-table";
import { Card, cn, PageHeader, Stat } from "@/components/ui";
import { DISPLAY_TZ } from "@/lib/format";
import { analytics, listProjects, rate } from "@/lib/queries";

export const metadata: Metadata = { title: "Analytics" };

type SP = Promise<Record<string, string | undefined>>;
const RANGES = [7, 30, 90, 365];

export default async function AnalyticsPage({ searchParams }: { searchParams: SP }) {
  const params = await searchParams;
  const days = RANGES.includes(Number(params.days)) ? Number(params.days) : 30;
  const projectId = params.project;
  const [projects, a] = await Promise.all([listProjects(), analytics({ days, projectId })]);
  const t = a.totals;

  const link = (patch: Record<string, string | undefined>) => {
    const qs = new URLSearchParams(
      Object.entries({ days: String(days), project: projectId, ...patch }).filter((e): e is [string, string] => !!e[1]),
    );
    return `/analytics?${qs}`;
  };
  const chip = (active: boolean) =>
    cn("rounded-full border px-3 py-1 text-xs", active ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:text-fg");

  return (
    <>
      <PageHeader title="Analytics" subtitle="Computed from your own database: zero Resend API calls." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <Link key={r} href={link({ days: String(r) })} className={chip(r === days)}>
            {r === 365 ? "1 year" : `${r} days`}
          </Link>
        ))}
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
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Sent" value={t.sent} />
        <Stat label="Received" value={t.received} />
        <Stat label="Delivered" value={rate(t.delivered, t.sent)} hint={`${t.delivered} emails`} />
        <Stat label="Opened" value={rate(t.opened, t.delivered || t.sent)} hint={`Clicked: ${rate(t.clicked, t.delivered || t.sent)}`} />
        <Stat label="Bounced / spam" value={rate(t.bounced + t.complained, t.sent)} hint={`${t.bounced} bounced · ${t.complained} complaints`} />
      </div>

      <Card className="mt-4 p-4">
        <h2 className="mb-3 text-sm font-medium">Volume per day (UTC)</h2>
        <VolumeChart data={a.series} />
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
              {a.series.map((d) => (
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
        <h2 className="mb-3 text-sm font-medium">By project</h2>
        <ProjectTable rows={a.byProject} />
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-medium">Top contacts</h2>
          {a.topContacts.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="pb-2 font-medium">Address</th>
                  <th className="pb-2 text-right font-medium">Sent to</th>
                  <th className="pb-2 text-right font-medium">From</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {a.topContacts.map((c) => (
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
          {a.topLinks.length ? (
            <ul className="divide-y divide-border text-sm">
              {a.topLinks.map((l) => (
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
        <HourChart data={a.hourly} tz={DISPLAY_TZ} />
      </Card>
    </>
  );
}
