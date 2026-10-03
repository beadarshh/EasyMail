import Link from "next/link";
import { buttonStyles } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto mt-24 max-w-md px-4 text-center">
      <h1 className="text-lg font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 text-sm text-muted">That page doesn&apos;t exist, or the conversation was deleted.</p>
      <div className="mt-5 flex justify-center gap-2">
        <Link href="/" className={buttonStyles.primary}>
          Dashboard
        </Link>
        <Link href="/inbox" className={buttonStyles.secondary}>
          Inbox
        </Link>
      </div>
    </div>
  );
}
