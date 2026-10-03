"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { changeMyPassword, createAdmin, deleteAdmin } from "@/app/(app)/actions";
import { buttonStyles, cn, inputStyles } from "./ui";

function Result({ state }: { state: { error?: string; ok?: string } | undefined }) {
  if (state?.error) return <p className="text-sm text-danger">{state.error}</p>;
  if (state?.ok) return <p className="text-sm text-emerald-600 dark:text-emerald-400">{state.ok}</p>;
  return null;
}

function useResetOnOk(state: { ok?: string } | undefined) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return ref;
}

export function NewAdminForm() {
  const [state, action, pending] = useActionState(createAdmin, undefined);
  const ref = useResetOnOk(state);
  return (
    <form ref={ref} action={action} className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input name="username" required placeholder="Username" autoComplete="off" autoCapitalize="none" className={inputStyles} />
        <input name="password" type="password" required minLength={10} placeholder="Password (10+ chars)" autoComplete="new-password" className={inputStyles} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <Result state={state} />
        <button disabled={pending} className={cn(buttonStyles.secondary, "ml-auto")}>
          Add admin
        </button>
      </div>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changeMyPassword, undefined);
  const ref = useResetOnOk(state);
  return (
    <form ref={ref} action={action} className="space-y-2">
      <input name="current" type="password" required placeholder="Current password" autoComplete="current-password" className={inputStyles} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input name="next" type="password" required minLength={10} placeholder="New password" autoComplete="new-password" className={inputStyles} />
        <input name="confirm" type="password" required minLength={10} placeholder="Confirm new password" autoComplete="new-password" className={inputStyles} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <Result state={state} />
        <button disabled={pending} className={cn(buttonStyles.secondary, "ml-auto")}>
          Change password
        </button>
      </div>
    </form>
  );
}

export function DeleteAdminButton({ id, username }: { id: string; username: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      aria-label={`Remove ${username}`}
      className={cn(buttonStyles.ghost, "hover:text-danger")}
      onClick={() => confirm(`Remove admin "${username}"? They'll be signed out immediately.`) && start(async () => void (await deleteAdmin(id)))}
    >
      <Trash2 className="size-4" />
    </button>
  );
}
