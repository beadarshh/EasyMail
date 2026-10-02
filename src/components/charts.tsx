"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const axis = { stroke: "var(--muted)", fontSize: 11, tickLine: false, axisLine: false } as const;

function TipBox({ title, rows }: { title: string; rows: { label: string; value: number; color?: string }[] }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2 text-muted">
          {r.color && <span className="h-0.5 w-3 rounded-full" style={{ background: r.color }} />}
          <span className="flex-1">{r.label}</span>
          <span className="font-medium text-fg tabular-nums">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

const shortDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** Sent vs received per UTC day — two series, one axis, legend + crosshair tooltip. */
export function VolumeChart({ data }: { data: { day: string; sent: number; received: number }[] }) {
  return (
    <div>
      <div className="mb-3 flex gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-[var(--series-1)]" /> Sent
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-[var(--series-2)]" /> Received
        </span>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="day" tickFormatter={shortDay} minTickGap={24} {...axis} />
            <YAxis allowDecimals={false} {...axis} />
            <Tooltip
              cursor={{ stroke: "var(--muted)", strokeDasharray: "3 3" }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TipBox
                    title={shortDay(String(label))}
                    rows={[
                      { label: "Sent", value: Number(payload.find((p) => p.dataKey === "sent")?.value ?? 0), color: "var(--series-1)" },
                      { label: "Received", value: Number(payload.find((p) => p.dataKey === "received")?.value ?? 0), color: "var(--series-2)" },
                    ]}
                  />
                ) : null
              }
            />
            <Line type="monotone" dataKey="sent" stroke="var(--series-1)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} />
            <Line type="monotone" dataKey="received" stroke="var(--series-2)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Inbound mail by hour of day — single series, so no legend; the title names it. */
export function HourChart({ data, tz }: { data: { hour: number; n: number }[]; tz: string }) {
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="hour" tickFormatter={(h) => `${h}`.padStart(2, "0")} interval={2} {...axis} />
          <YAxis allowDecimals={false} {...axis} />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TipBox
                  title={`${String(payload[0].payload.hour).padStart(2, "0")}:00 ${tz}`}
                  rows={[{ label: "Received", value: Number(payload[0].value) }]}
                />
              ) : null
            }
          />
          <Bar dataKey="n" fill="var(--series-1)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
