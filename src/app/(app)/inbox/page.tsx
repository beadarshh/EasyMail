import type { Metadata } from "next";
import { EmailList } from "@/components/email-list";
import { ListFilters, Pager } from "@/components/list-filters";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { listEmails, listProjects } from "@/lib/queries";

export const metadata: Metadata = { title: "Inbox" };

type SP = Promise<Record<string, string | undefined>>;

export default async function InboxPage({ searchParams }: { searchParams: SP }) {
  const params = await searchParams;
  const [, projects, { rows, hasMore, page }] = await Promise.all([
    requireSession(),
    listProjects(),
    listEmails({
      direction: "inbound",
      q: params.q,
      projectId: params.project,
      unread: params.unread === "1",
      starred: params.starred === "1",
      archived: params.archived === "1",
      page: Number(params.page) || 1,
    }),
  ]);
  const filtered = Object.values(params).some(Boolean);

  return (
    <>
      <PageHeader title={params.archived === "1" ? "Archive" : "Inbox"} subtitle="Mail received on your Resend domains." />
      <ListFilters
        base="/inbox"
        params={params}
        projects={projects}
        toggles={[
          { key: "unread", label: "Unread" },
          { key: "starred", label: "Starred" },
          { key: "archived", label: "Archived" },
        ]}
      />
      {rows.length ? (
        <EmailList rows={rows} mode="inbound" />
      ) : (
        <EmptyState
          title={filtered ? "Nothing matches these filters" : "No mail yet"}
          hint={filtered ? undefined : "Point your Resend receiving domain's MX record at Resend and add the email.received webhook. New mail lands here instantly."}
          action={filtered ? undefined : { href: "/settings", label: "Check setup" }}
        />
      )}
      <Pager base="/inbox" params={params} page={page} hasMore={hasMore} />
    </>
  );
}
