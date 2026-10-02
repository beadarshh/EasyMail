import type { Metadata } from "next";
import { EmailList } from "@/components/email-list";
import { ListFilters, Pager } from "@/components/list-filters";
import { EmptyState, PageHeader } from "@/components/ui";
import { listEmails, listProjects } from "@/lib/queries";

export const metadata: Metadata = { title: "Sent" };

type SP = Promise<Record<string, string | undefined>>;

export default async function SentPage({ searchParams }: { searchParams: SP }) {
  const params = await searchParams;
  const [projects, { rows, hasMore, page }] = await Promise.all([
    listProjects(),
    listEmails({
      direction: "outbound",
      q: params.q,
      projectId: params.project,
      status: params.status,
      starred: params.starred === "1",
      page: Number(params.page) || 1,
    }),
  ]);
  const filtered = Object.values(params).some(Boolean);

  return (
    <>
      <PageHeader title="Sent" subtitle="Everything sent from EasyMail, plus mail your apps send through the same Resend account." />
      <ListFilters
        base="/sent"
        params={params}
        projects={projects}
        toggles={[{ key: "starred", label: "Starred" }]}
        statuses={["delivered", "opened", "clicked", "bounced", "complained"]}
      />
      {rows.length ? (
        <EmailList rows={rows} mode="outbound" />
      ) : (
        <EmptyState
          title={filtered ? "Nothing matches these filters" : "Nothing sent yet"}
          action={filtered ? undefined : { href: "/compose", label: "Compose" }}
        />
      )}
      <Pager base="/sent" params={params} page={page} hasMore={hasMore} />
    </>
  );
}
