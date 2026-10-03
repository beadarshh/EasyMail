"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { admins, db } from "@/db";
import { adminCount, endSession, startSession } from "@/lib/auth";
import { hashPassword, passwordProblem, USERNAME_RE, verifyPassword } from "@/lib/password";

type FormState = { error?: string } | undefined;

// Burns comparable time when the username doesn't exist, so timing doesn't reveal valid usernames.
const DUMMY_HASH = hashPassword("easymail-timing-equalizer");

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const [admin] = USERNAME_RE.test(username) ? await db().select().from(admins).where(eq(admins.username, username)) : [];
  const ok = await verifyPassword(password, admin?.passwordHash ?? (await DUMMY_HASH));
  if (!admin || !ok) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return { error: "Incorrect username or password" };
  }

  after(() => db().update(admins).set({ lastLoginAt: new Date() }).where(eq(admins.id, admin.id)));
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

  const [admin] = await db()
    .insert(admins)
    .values({ username, passwordHash: await hashPassword(password), lastLoginAt: new Date() })
    .returning();
  // If two setups raced, only the first may stay.
  if ((await adminCount()) > 1) {
    await db().delete(admins).where(eq(admins.id, admin.id));
    redirect("/login");
  }

  await startSession(admin);
  redirect("/");
}

export async function logout() {
  await endSession();
  redirect("/login");
}
