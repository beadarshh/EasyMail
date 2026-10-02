import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { adminCount } from "@/lib/auth";
import { LoginForm } from "../login/login-form";

export const metadata: Metadata = { title: "Set up" };

export default async function SetupPage() {
  if ((await adminCount()) > 0) redirect("/login");
  return (
    <AuthShell>
      <LoginForm mode="setup" />
    </AuthShell>
  );
}
