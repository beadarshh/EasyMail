"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { refreshStuckStatuses } from "@/app/(app)/actions";
import { buttonStyles } from "./ui";

export function RefreshStatusBanner({ count }: { count: number }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string>();
  if (!count && !result) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm">
      <span className="text-muted">
        {result ??
          `${count} email${count === 1 ? " is" : "s are"} still "queued": probably sent before the webhook was connected, so no delivery events arrived.`}
      </span>
      {!result && (
        <button
          disabled={pending}
          className={buttonStyles.secondary}
          onClick={() =>
            start(async () => {
              const r = await refreshStuckStatuses();
              setResult(`Checked ${r.checked}, updated ${r.updated}.`);
            })
          }
        >
          <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} />
          Refresh from Resend ({Math.min(count, 25)} API call{count === 1 ? "" : "s"})
        </button>
      )}
    </div>
  );
}
