"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { currentAdmin, endSession, startSession } from "@/lib/auth";
import { hashPassword, passwordProblem, USERNAME_RE, verifyPassword } from "@/lib/password";
import { adminCount, createFirstAdmin, getAdminByUsername, logFailedLogin, logLogout, touchLastLogin } from "@/services/admin.service";

type FormState = { error?: string } | undefined;

// Burns comparable time when the username doesn't exist, so timing doesn't reveal valid usernames.
const DUMMY_HASH = hashPassword("easymail-timing-equalizer");

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const admin = USERNAME_RE.test(username) ? await getAdminByUsername(username) : null;
  const ok = await verifyPassword(password, admin?.passwordHash ?? (await DUMMY_HASH));
  if (!admin || !ok) {
    after(() => logFailedLogin(username));
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return { error: "Incorrect username or password" };
  }

  // Written after the redirect response is sent, so signing in doesn't wait on the database.
  after(() => touchLastLogin(admin));
  await startSession(admin);
  redirect("/");
}

/** First-run only: creates the first admin when the table is empty. */
export async function setupAdmin(_prev: FormState, formData: FormData): Promise<FormState> {
  if ((await adminCount()) > 0) redirect("/login");

  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!USERNAME_RE.test(username)) return { error: "Username: 3–32 characters, letters, numbers, . _ -" };
  const problem = passwordProblem(password);
  if (problem) return { error: problem };
  if (password !== confirm) return { error: "Passwords don't match" };

  // If two setups raced, only the first may stay.
  const admin = await createFirstAdmin(username, await hashPassword(password));
  if (!admin) redirect("/login");

  await startSession(admin);
  redirect("/");
}

export async function logout() {
  const me = await currentAdmin().catch(() => null);
  await endSession();
  if (me) after(() => logLogout(me.username));
  redirect("/login");
}
