import type { Metadata } from "next";
import { DeleteProjectButton, IdentityRowControls, NewIdentityForm, NewProjectForm } from "@/components/project-forms";
import { Card, PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { listIdentities, listProjects } from "@/services/project.service";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const [, projects, ids] = await Promise.all([requireSession(), listProjects(), listIdentities()]);
  const options = projects.map((p) => ({ id: p.id, name: p.name }));

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

      <Card className="mt-4 p-4 text-sm text-muted">
        <p className="mb-1 font-medium text-fg">Tracking mail your apps send</p>
        Mail your other projects send through the same Resend account shows up in <b>Sent</b> automatically via webhooks. To file it
        under a project, either send from an address listed here or add the tag <code>project=&lt;slug&gt;</code> when calling the
        Resend API.
      </Card>
    </>
  );
}
