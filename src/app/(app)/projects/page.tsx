import type { Metadata } from "next";
import { headers } from "next/headers";
import {
  DeleteProjectButton,
  IdentityRowControls,
  NewApiKeyForm,
  NewIdentityForm,
  NewProjectForm,
  RevokeApiKeyButton,
} from "@/components/project-forms";
import { Card, PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { listApiKeys } from "@/services/api-key.service";
import { listIdentities, listProjects } from "@/services/project.service";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const [, projects, ids, keys] = await Promise.all([requireSession(), listProjects(), listIdentities(), listApiKeys()]);
  const options = projects.map((p) => ({ id: p.id, name: p.name }));
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "your-app.vercel.app";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  return (
    <>
      <PageHeader
        title="Projects & addresses"
        subtitle="Group mail by project. Each address belongs to one project, which tags everything it sends or receives."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-medium">Projects</h2>
          <NewProjectForm nextColor={projects.length} />
          <ul className="mt-4 divide-y divide-border">
            {projects.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="size-3 rounded-full" style={{ background: p.color }} />
                <span className="flex-1 font-medium">{p.name}</span>
                <code className="text-xs text-muted">tag: project={p.slug}</code>
                <DeleteProjectButton id={p.id} name={p.name} />
              </li>
            ))}
            {!projects.length && <li className="py-2 text-sm text-muted">No projects yet.</li>}
          </ul>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-sm font-medium">Addresses</h2>
          <NewIdentityForm projects={options} />
          <ul className="mt-4 divide-y divide-border">
            {ids.map(({ identity: i }) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{i.address}</p>
                  <p className="text-xs text-muted">
                    {i.displayName ? `${i.displayName} · ` : ""}
                    {[i.canSend && "send", i.canReceive && "receive"].filter(Boolean).join(" + ")}
                  </p>
                </div>
                <IdentityRowControls id={i.id} projectId={i.projectId} projects={options} />
              </li>
            ))}
            {!ids.length && <li className="py-2 text-sm text-muted">No addresses yet.</li>}
          </ul>
        </Card>
      </div>

      <Card className="mt-4 p-4">
        <h2 className="mb-1 text-sm font-medium">Website API keys</h2>
        <p className="mb-3 text-sm text-muted">
          Let a website&apos;s contact form send mail through EasyMail. A key works only from the domains you list, and always sends
          from the chosen address to the chosen recipient.
        </p>
        <NewApiKeyForm
          projects={options}
          senders={ids.filter((r) => r.identity.canSend).map((r) => ({ id: r.identity.id, address: r.identity.address }))}
        />
        <ul className="mt-4 divide-y divide-border">
          {keys.map(({ key: k, projectName, fromAddress }) => (
            <li key={k.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {k.name} <code className="text-xs font-normal text-muted">{k.keyPrefix}…</code>
                  {k.revokedAt && <span className="ml-2 text-xs text-danger">revoked</span>}
                </p>
                <p className="text-xs text-muted">
                  {projectName ?? "No project"} · {k.allowedOrigins.join(", ")} · {fromAddress ?? "no From address"} → {k.toAddress}
                  {k.lastUsedAt ? ` · last used ${k.lastUsedAt.toLocaleDateString()}` : " · never used"}
                </p>
              </div>
              {!k.revokedAt && <RevokeApiKeyButton id={k.id} name={k.name} />}
            </li>
          ))}
          {!keys.length && <li className="py-2 text-sm text-muted">No API keys yet.</li>}
        </ul>
        <div className="mt-4 rounded-lg bg-surface-2 p-3 text-xs text-muted">
          <p className="mb-1 font-medium text-fg">Usage</p>
          <code className="block whitespace-pre-wrap">
            {`POST ${proto}://${host}/api/contact
x-api-key: em_...
Content-Type: application/json

{ "name": "Ada", "email": "ada@example.com", "message": "Hello", "phone": "optional", "organization": "optional" }`}
          </code>
        </div>
      </Card>

      <Card className="mt-4 p-4 text-sm text-muted">
        <p className="mb-1 font-medium text-fg">Tracking mail your apps send</p>
        Mail your other projects send through the same Resend account shows up in <b>Sent</b> automatically via webhooks. To file it
        under a project, either send from an address listed here or add the tag <code>project=&lt;slug&gt;</code> when calling the
        Resend API.
      </Card>
    </>
  );
}
