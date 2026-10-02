import { rate } from "@/lib/queries";

type Row = { projectId: string | null; name: string; color: string | null; sent: number; received: number; delivered: number; opened: number; bounced: number };

export function ProjectTable({ rows }: { rows: Row[] }) {
  if (!rows.length) return <p className="text-sm text-muted">No mail in this period.</p>;
  const max = Math.max(...rows.map((r) => r.sent + r.received), 1);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="pb-2 font-medium">Project</th>
            <th className="pb-2 font-medium">Volume</th>
            <th className="pb-2 text-right font-medium">Sent</th>
            <th className="pb-2 text-right font-medium">Received</th>
            <th className="pb-2 text-right font-medium">Delivered</th>
            <th className="pb-2 text-right font-medium">Opened</th>
            <th className="pb-2 text-right font-medium">Bounce</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.projectId ?? "none"}>
              <td className="py-2 pr-3">
                <span className="inline-flex items-center gap-2 whitespace-nowrap">
                  <span className="size-2 rounded-full" style={{ background: r.color ?? "var(--muted)" }} />
                  {r.name}
                </span>
              </td>
              <td className="w-40 py-2 pr-3">
                <div className="h-1.5 rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-[var(--series-1)]" style={{ width: `${((r.sent + r.received) / max) * 100}%` }} />
                </div>
              </td>
              <td className="py-2 text-right tabular-nums">{r.sent}</td>
              <td className="py-2 text-right tabular-nums">{r.received}</td>
              <td className="py-2 text-right tabular-nums">{rate(r.delivered, r.sent)}</td>
              <td className="py-2 text-right tabular-nums">{rate(r.opened, r.sent)}</td>
              <td className="py-2 text-right tabular-nums">{rate(r.bounced, r.sent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
