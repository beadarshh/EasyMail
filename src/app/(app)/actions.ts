"use server";

import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { admins, attachments, db, emails, identities, projects } from "@/db";
import { requireSession, startSession } from "@/lib/auth";
import { hashPassword, passwordProblem, USERNAME_RE, verifyPassword } from "@/lib/password";
import { setSetting } from "@/lib/kv";
import { slugify } from "@/lib/mail-utils";
import { resend, throttled } from "@/lib/resend";
import { removeAttachments } from "@/lib/storage";
import { connectWebhook, disconnectWebhook, recentDeliveries, replayDelivery, rotateWebhookSecret } from "@/lib/webhook-config";

export async function setFlags(ids: string[], flags: { isRead?: boolean; isStarred?: boolean; isArchived?: boolean }) {
  await requireSession();
  if (!ids.length) return;
  await db().update(emails).set(flags).where(inArray(emails.id, ids));
  revalidatePath("/", "layout");
}

export async function deleteThread(threadId: string) {
  await requireSession();
  const rows = await db().select({ id: emails.id }).from(emails).where(eq(emails.threadId, threadId));
  const files = rows.length
    ? await db().select({ path: attachments.storagePath }).from(attachments).where(inArray(attachments.emailId, rows.map((r) => r.id)))
    : [];
  await removeAttachments(files.map((f) => f.path).filter((p): p is string => !!p));
  await db().delete(emails).where(eq(emails.threadId, threadId));
  revalidatePath("/", "layout");
}

const projectSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6366f1"),
});

export async function createProject(_: unknown, formData: FormData) {
  await requireSession();
  const parsed = projectSchema.safeParse({ name: formData.get("name"), color: formData.get("color") || undefined });
  if (!parsed.success) return { error: "Enter a project name" };
  const slug = slugify(parsed.data.name);
  if (!slug) return { error: "Name needs letters or numbers" };
  try {
    await db().insert(projects).values({ ...parsed.data, slug });
  } catch {
    return { error: `A project with slug "${slug}" already exists` };
  }
  revalidatePath("/projects");
  return { ok: true };
}

export async function deleteProject(id: string) {
  await requireSession();
  await db().delete(projects).where(eq(projects.id, id));
  revalidatePath("/", "layout");
}

const identitySchema = z.object({
  address: z.string().trim().toLowerCase().email(),
  displayName: z.string().trim().max(80).optional(),
  projectId: z.string().uuid().optional(),
  canSend: z.boolean(),
  canReceive: z.boolean(),
});

export async function createIdentity(_: unknown, formData: FormData) {
  await requireSession();
  const parsed = identitySchema.safeParse({
    address: formData.get("address"),
    displayName: formData.get("displayName") || undefined,
    projectId: formData.get("projectId") || undefined,
    canSend: formData.get("canSend") === "on",
    canReceive: formData.get("canReceive") === "on",
  });
  if (!parsed.success) return { error: "Enter a valid email address" };
  try {
    await db().insert(identities).values(parsed.data);
  } catch {
    return { error: "That address already exists" };
  }
  // Attach earlier unassigned mail from/to this address to its project.
  if (parsed.data.projectId) {
    const addr = parsed.data.address;
    await db()
      .update(emails)
      .set({ projectId: parsed.data.projectId })
      .where(
        and(
          isNull(emails.projectId),
          or(
            and(eq(emails.direction, "outbound"), eq(emails.fromAddress, addr)),
            and(eq(emails.direction, "inbound"), sql`array_to_string(${emails.to}, ',') ilike ${`%${addr}%`}`),
          ),
        ),
      );
  }
  revalidatePath("/projects");
  return { ok: true };
}

export async function updateIdentityProject(id: string, projectId: string | null) {
  await requireSession();
  await db().update(identities).set({ projectId }).where(eq(identities.id, id));
  revalidatePath("/projects");
}

export async function deleteIdentity(id: string) {
  await requireSession();
  await db().delete(identities).where(eq(identities.id, id));
  revalidatePath("/projects");
}

/** One API call: pull Resend's authoritative usage numbers. */
export async function syncUsage() {
  await requireSession();
  const { data, error } = await throttled(() => resend().usage.get());
  if (error || !data) return { error: error?.message ?? "Failed to fetch usage" };
  await setSetting("resend_usage", { ...data.emails, rate_limit: data.rate_limit, domains: data.domains, fetchedAt: new Date().toISOString() });
  revalidatePath("/settings");
  return { ok: true };
}

type FormState = { error?: string; ok?: string } | undefined;

export async function createAdmin(_: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!USERNAME_RE.test(username)) return { error: "Username: 3–32 characters, letters, numbers, . _ -" };
  const problem = passwordProblem(password);
  if (problem) return { error: problem };
  try {
    await db().insert(admins).values({ username, passwordHash: await hashPassword(password) });
  } catch {
    return { error: "That username is taken" };
  }
  revalidatePath("/settings");
  return { ok: `Admin "${username}" created` };
}

export async function changeMyPassword(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireSession();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  if (!(await verifyPassword(current, me.passwordHash))) return { error: "Current password is wrong" };
  const problem = passwordProblem(next);
  if (problem) return { error: problem };
  if (next !== String(formData.get("confirm") ?? "")) return { error: "Passwords don't match" };
  const [updated] = await db()
    .update(admins)
    .set({ passwordHash: await hashPassword(next), sessionVersion: sql`${admins.sessionVersion} + 1` })
    .where(eq(admins.id, me.id))
    .returning();
  // Other devices are signed out (session version changed); keep this one signed in.
  await startSession(updated);
  return { ok: "Password changed. Other sessions were signed out." };
}

export async function deleteAdmin(id: string) {
  const me = await requireSession();
  if (id === me.id) return { error: "You can't remove yourself" };
  await db().delete(admins).where(eq(admins.id, id));
  revalidatePath("/settings");
  return { ok: true };
}

// ─── Resend webhook management (API calls only when you click) ───────────

function publicBaseUrl(input: string): string | { error: string } {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return { error: "Enter your app's public URL, e.g. https://easymail.vercel.app" };
  }
  if (u.protocol !== "https:") return { error: "The URL must start with https://" };
  if (/^(localhost|127\.|\[::1\]|0\.0\.0\.0|192\.168\.|10\.)/.test(u.hostname)) {
    return { error: "Resend can't reach a local address. Use your deployed URL or a tunnel URL." };
  }
  return u.origin;
}

export async function connectWebhookAction(_: FormState, formData: FormData): Promise<FormState> {
  await requireSession();
  const base = publicBaseUrl(String(formData.get("baseUrl") ?? ""));
  if (typeof base !== "string") return base;
  try {
    const cfg = await connectWebhook(base);
    revalidatePath("/settings");
    return { ok: `Connected: Resend will send events to ${cfg.endpoint}` };
  } catch (err) {
    return { error: `Resend: ${(err as Error).message}` };
  }
}

export async function rotateWebhookAction() {
  await requireSession();
  try {
    await rotateWebhookSecret();
    revalidatePath("/settings");
    return { ok: "Signing secret rotated" };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function disconnectWebhookAction() {
  await requireSession();
  try {
    await disconnectWebhook();
    revalidatePath("/settings");
    return { ok: "Webhook removed from Resend" };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function loadDeliveriesAction() {
  await requireSession();
  try {
    return { deliveries: await recentDeliveries() };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function replayDeliveryAction(eventId: string) {
  await requireSession();
  try {
    await replayDelivery(eventId);
    return { ok: true };
  } catch (err) {
    return { error: (err as Error).message };
  }
}
