"use client";

import Link from "next/link";
import { useEffect } from "react";
import { buttonStyles } from "@/components/ui";

// Catches anything a page throws (a database hiccup, a slow connection) so the sidebar stays usable
// and one click retries, instead of a blank crash page.
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border border-border bg-surface p-6 text-center">
      <h1 className="text-lg font-semibold tracking-tight">This page didn&apos;t load</h1>
      <p className="mt-2 text-sm text-muted">
        It&apos;s usually a brief connection problem with the database. Your data is safe. Try again in a moment.
      </p>
      {error.digest && <p className="mt-2 text-xs text-muted">Reference: {error.digest}</p>}
      <div className="mt-5 flex justify-center gap-2">
        <button onClick={() => retry()} className={buttonStyles.primary}>
          Try again
        </button>
        <Link href="/" className={buttonStyles.secondary}>
          Dashboard
        </Link>
      </div>
    </div>
  );
}
