"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { createIdentity, createProject, deleteIdentity, deleteProject, updateIdentityProject } from "@/app/(app)/actions";
import { buttonStyles, cn, inputStyles } from "./ui";

const PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];

export function NewProjectForm({ nextColor }: { nextColor: number }) {
  const [state, action, pending] = useActionState(createProject, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state && "ok" in state) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="flex flex-wrap items-start gap-2">
      <input name="name" required placeholder="Project name (e.g. Portfolio)" className={cn(inputStyles, "w-auto flex-1")} />
      <input
        name="color"
        type="color"
        defaultValue={PALETTE[nextColor % PALETTE.length]}
        className="h-9 w-12 cursor-pointer rounded-lg border border-border bg-surface p-1"
        aria-label="Project color"
      />
      <button disabled={pending} className={buttonStyles.primary}>
        Add project
      </button>
      {state && "error" in state && <p className="w-full text-sm text-danger">{state.error}</p>}
    </form>
  );
}

export function NewIdentityForm({ projects }: { projects: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createIdentity, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state && "ok" in state) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="grid gap-2 sm:grid-cols-2">
      <input name="address" type="email" required placeholder="hello@mail.yourdomain.com" className={inputStyles} />
      <input name="displayName" placeholder="Display name (optional)" className={inputStyles} />
      <select name="projectId" className={inputStyles} defaultValue="">
        <option value="">No project</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-4 text-sm">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" name="canSend" defaultChecked /> Send
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" name="canReceive" defaultChecked /> Receive
        </label>
        <button disabled={pending} className={cn(buttonStyles.primary, "ml-auto")}>
          Add address
        </button>
      </div>
      {state && "error" in state && <p className="text-sm text-danger sm:col-span-2">{state.error}</p>}
    </form>
  );
}

export function DeleteProjectButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      aria-label={`Delete ${name}`}
      className={cn(buttonStyles.ghost, "hover:text-danger")}
      onClick={() => confirm(`Delete project "${name}"? Its mail is kept but becomes unassigned.`) && start(() => deleteProject(id))}
    >
      <Trash2 className="size-4" />
    </button>
  );
}

export function IdentityRowControls({ id, projectId, projects }: { id: string; projectId: string | null; projects: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  return (
    <div className={cn("flex items-center gap-1", pending && "opacity-60")}>
      <select
        aria-label="Project"
        defaultValue={projectId ?? ""}
        onChange={(e) => start(() => updateIdentityProject(id, e.target.value || null))}
        className="h-8 rounded-lg border border-border bg-surface px-2 text-xs"
      >
        <option value="">No project</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button
        aria-label="Delete address"
        className={cn(buttonStyles.ghost, "hover:text-danger")}
        onClick={() => confirm("Remove this address? Past mail is kept.") && start(() => deleteIdentity(id))}
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}
