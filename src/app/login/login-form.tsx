"use client";

import { useActionState } from "react";
import { buttonStyles, Card, cn, inputStyles } from "@/components/ui";
import { login, setupAdmin } from "./actions";

export function LoginForm({ mode }: { mode: "login" | "setup" }) {
  const [state, action, pending] = useActionState(mode === "login" ? login : setupAdmin, undefined);
  const setup = mode === "setup";
  return (
    <Card className="p-6">
      {setup && (
        <div className="mb-5">
          <h1 className="font-semibold">Create your admin account</h1>
          <p className="mt-1 text-sm text-muted">This page only works once, while no admin exists. You can add more admins later in Settings.</p>
        </div>
      )}
      <form action={action} className="space-y-4">
        <div>
          <label htmlFor="username" className="mb-1.5 block text-sm font-medium">
            Username
          </label>
          <input id="username" name="username" required autoFocus autoComplete="username" autoCapitalize="none" spellCheck={false} className={inputStyles} />
        </div>
        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={setup ? 10 : undefined}
            autoComplete={setup ? "new-password" : "current-password"}
            className={inputStyles}
          />
        </div>
        {setup && (
          <div>
            <label htmlFor="confirm" className="mb-1.5 block text-sm font-medium">
              Confirm password
            </label>
            <input id="confirm" name="confirm" type="password" required minLength={10} autoComplete="new-password" className={inputStyles} />
          </div>
        )}
        {state?.error && <p className="text-sm text-danger">{state.error}</p>}
        <button type="submit" disabled={pending} className={cn(buttonStyles.primary, "w-full")}>
          {pending ? "Please wait…" : setup ? "Create admin" : "Sign in"}
        </button>
      </form>
    </Card>
  );
}
