import "server-only";
import { count, eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { admins, db, type Admin } from "@/db";
import { env } from "./env";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession, verifySession } from "./session";

export async function adminCount() {
  const [r] = await db().select({ n: count() }).from(admins);
  return r?.n ?? 0;
}

export async function startSession(admin: Pick<Admin, "id" | "sessionVersion">) {
  const token = await signSession({ sub: admin.id, ver: admin.sessionVersion }, env().SESSION_SECRET);
  const h = await headers();
  // Secure everywhere except plain-http localhost (e.g. `next start` locally).
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(h.get("host") ?? "");
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: !local || h.get("x-forwarded-proto") === "https",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Valid token AND the admin still exists with the same session version. */
export async function currentAdmin(): Promise<Admin | null> {
  const claims = await verifySession((await cookies()).get(SESSION_COOKIE)?.value, env().SESSION_SECRET);
  if (!claims || !/^[0-9a-f-]{36}$/i.test(claims.sub)) return null;
  const [admin] = await db().select().from(admins).where(eq(admins.id, claims.sub));
  if (!admin || admin.sessionVersion !== claims.ver) return null;
  return admin;
}

/** Call at the top of every protected page / server action. */
export async function requireSession(): Promise<Admin> {
  const admin = await currentAdmin();
  if (!admin) redirect("/login");
  return admin;
}
