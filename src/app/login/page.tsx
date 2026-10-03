import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { currentAdmin } from "@/lib/auth";
import { adminCount } from "@/services/admin.service";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if ((await adminCount()) === 0) redirect("/setup");
  if (await currentAdmin()) redirect("/");
  return (
    <AuthShell>
      <LoginForm mode="login" />
    </AuthShell>
  );
}
