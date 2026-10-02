// Shown instantly on navigation (and prefetched with links) while the page's data loads.
export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="mb-2 h-6 w-40 rounded-md bg-surface-2" />
      <div className="mb-6 h-4 w-72 rounded-md bg-surface-2" />
      <div className="mb-4 h-9 w-full rounded-lg bg-surface-2" />
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border px-4 py-3.5 last:border-0">
            <div className="h-4 w-48 shrink-0 rounded bg-surface-2" />
            <div className="h-4 flex-1 rounded bg-surface-2" />
            <div className="h-4 w-14 shrink-0 rounded bg-surface-2" />
          </div>
        ))}
      </div>
    </div>
  );
}
