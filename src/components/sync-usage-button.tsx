"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { syncUsage } from "@/app/(app)/actions";
import { buttonStyles } from "./ui";

export function SyncUsageButton() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="flex items-center gap-3">
      <button
        disabled={pending}
        className={buttonStyles.secondary}
        onClick={() =>
          start(async () => {
            const r = await syncUsage();
            setError(r && "error" in r ? r.error : undefined);
          })
        }
      >
        <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} /> Sync from Resend
      </button>
      <span className="text-xs text-muted">{error ? <span className="text-danger">{error}</span> : "Uses 1 API call."}</span>
    </div>
  );
}
