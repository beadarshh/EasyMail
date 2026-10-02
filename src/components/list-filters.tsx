import Link from "next/link";
import { Search } from "lucide-react";
import type { Project } from "@/db/schema";
import { cn, inputStyles } from "./ui";

type Props = {
  base: string;
  params: Record<string, string | undefined>;
  projects: Project[];
  toggles: { key: string; label: string }[];
  statuses?: string[];
};

function href(base: string, params: Record<string, string | undefined>, patch: Record<string, string | undefined>) {
  const merged: Record<string, string | undefined> = { ...params, ...patch, page: undefined };
  const qs = new URLSearchParams(Object.entries(merged).filter((e): e is [string, string] => !!e[1])).toString();
  return qs ? `${base}?${qs}` : base;
}

const chip = "rounded-full border px-3 py-1 text-xs transition-colors";
const on = "border-accent bg-accent/10 text-accent";
const off = "border-border text-muted hover:text-fg";

export function ListFilters({ base, params, projects, toggles, statuses }: Props) {
  return (
    <div className="mb-4 space-y-3">
      <form action={base} className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input name="q" defaultValue={params.q} placeholder="Search subject, sender, recipients, body…" className={cn(inputStyles, "pl-9")} />
        {Object.entries(params)
          .filter(([k, v]) => k !== "q" && k !== "page" && v)
          .map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
      </form>
      <div className="flex flex-wrap items-center gap-2">
        {toggles.map((t) => {
          const active = params[t.key] === "1";
          return (
            <Link key={t.key} href={href(base, params, { [t.key]: active ? undefined : "1" })} className={cn(chip, active ? on : off)}>
              {t.label}
            </Link>
          );
        })}
        {statuses?.map((s) => {
          const active = params.status === s;
          return (
            <Link key={s} href={href(base, params, { status: active ? undefined : s })} className={cn(chip, "capitalize", active ? on : off)}>
              {s}
            </Link>
          );
        })}
        {projects.length > 0 && <span className="mx-1 h-4 w-px bg-border" />}
        {projects.map((p) => {
          const active = params.project === p.id;
          return (
            <Link key={p.id} href={href(base, params, { project: active ? undefined : p.id })} className={cn(chip, "inline-flex items-center gap-1.5", active ? on : off)}>
              <span className="size-2 rounded-full" style={{ background: p.color }} />
              {p.name}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function Pager({ base, params, page, hasMore }: { base: string; params: Record<string, string | undefined>; page: number; hasMore: boolean }) {
  if (page === 1 && !hasMore) return null;
  const link = (p: number) => {
    const qs = new URLSearchParams(Object.entries({ ...params, page: String(p) }).filter((e): e is [string, string] => !!e[1]));
    return `${base}?${qs}`;
  };
  return (
    <div className="mt-4 flex justify-between text-sm">
      {page > 1 ? <Link href={link(page - 1)} className="text-accent">← Newer</Link> : <span />}
      {hasMore && <Link href={link(page + 1)} className="text-accent">Older →</Link>}
    </div>
  );
}
