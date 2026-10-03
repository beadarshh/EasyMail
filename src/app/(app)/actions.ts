"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession, startSession } from "@/lib/auth";
import { hashPassword, passwordProblem, USERNAME_RE, verifyPassword } from "@/lib/password";
import { parseHosts } from "@/lib/api-keys";
import { slugify } from "@/lib/mail-utils";
import { resend, throttled } from "@/lib/resend";
import { connectWebhook, disconnectWebhook, recentDeliveries, replayDelivery, rotateWebhookSecret } from "@/lib/webhook-config";
import { logActivity } from "@/services/activity.service";
import * as admins from "@/services/admin.service";
import * as apiKeys from "@/services/api-key.service";
import * as mail from "@/services/mail.service";
import * as projects from "@/services/project.service";
import { setSetting } from "@/services/settings.service";

// Server actions only check the session, validate input, call a service and refresh the page.
// All database work lives in src/services.

export async function setFlags(ids: string[], flags: { isRead?: boolean; isStarred?: boolean; isArchived?: boolean }) {
  await requireSession();
  await mail.setFlags(ids, flags);
  revalidatePath("/", "layout");
}

export async function deleteThread(threadId: string) {
  const me = await requireSession();
  await mail.deleteThread(threadId, me.username);
  revalidatePath("/", "layout");
}

const projectSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6366f1"),
});

export async function createProject(_: unknown, formData: FormData) {
  const me = await requireSession();
  const parsed = projectSchema.safeParse({ name: formData.get("name"), color: formData.get("color") || undefined });
  if (!parsed.success) return { error: "Enter a project name" };
  const slug = slugify(parsed.data.name);
  if (!slug) return { error: "Name needs letters or numbers" };
  try {
    await projects.createProject({ ...parsed.data, slug }, me.username);
  } catch {
    return { error: `A project with slug "${slug}" already exists` };
  }
  revalidatePath("/projects");
  return { ok: true };
}

export async function deleteProject(id: string) {
  const me = await requireSession();
  await projects.deleteProject(id, me.username);
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
  const me = await requireSession();
  const parsed = identitySchema.safeParse({
    address: formData.get("address"),
    displayName: formData.get("displayName") || undefined,
    projectId: formData.get("projectId") || undefined,
    canSend: formData.get("canSend") === "on",
    canReceive: formData.get("canReceive") === "on",
  });
  if (!parsed.success) return { error: "Enter a valid email address" };
  try {
    await projects.createIdentity(parsed.data, me.username);
  } catch {
    return { error: "That address already exists" };
  }
  revalidatePath("/projects");
  return { ok: true };
}

export async function updateIdentityProject(id: string, projectId: string | null) {
  const me = await requireSession();
  await projects.updateIdentityProject(id, projectId, me.username);
  revalidatePath("/projects");
}

export async function deleteIdentity(id: string) {
  const me = await requireSession();
  await projects.deleteIdentity(id, me.username);
  revalidatePath("/projects");
}

// ─── API keys (website contact forms) ────────────────────────────────────

const apiKeySchema = z.object({
  name: z.string().trim().min(1).max(60),
  projectId: z.string().uuid(),
  identityId: z.string().uuid(),
  toAddress: z.string().trim().toLowerCase().email(),
});

/** Returns the raw key once; it can't be shown again. */
export async function createApiKey(_: unknown, formData: FormData): Promise<{ error?: string; key?: string } | undefined> {
  const me = await requireSession();
  const parsed = apiKeySchema.safeParse({
    name: formData.get("name"),
    projectId: formData.get("projectId"),
    identityId: formData.get("identityId"),
    toAddress: formData.get("toAddress"),
  });
  if (!parsed.success) return { error: "Fill in the name, project, From address and recipient" };
  const allowedOrigins = parseHosts(String(formData.get("origins") ?? ""));
  if (!allowedOrigins.length) return { error: "Add at least one website domain, e.g. example.com" };
  const key = await apiKeys.createApiKey({ ...parsed.data, allowedOrigins }, me.username);
  revalidatePath("/projects");
  return { key };
}

export async function revokeApiKey(id: string) {
  const me = await requireSession();
  await apiKeys.revokeApiKey(id, me.username);
  revalidatePath("/projects");
}

/** One API call: pull Resend's authoritative usage numbers. */
export async function syncUsage() {
  const me = await requireSession();
  const { data, error } = await throttled(() => resend().usage.get());
  if (error || !data) return { error: error?.message ?? "Failed to fetch usage" };
  await setSetting("resend_usage", { ...data.emails, rate_limit: data.rate_limit, domains: data.domains, fetchedAt: new Date().toISOString() });
  await logActivity({ type: "usage.synced", title: "Synced usage numbers from Resend", actor: me.username });
  revalidatePath("/settings");
  return { ok: true };
}

type FormState = { error?: string; ok?: string } | undefined;

export async function createAdmin(_: FormState, formData: FormData): Promise<FormState> {
  const me = await requireSession();
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!USERNAME_RE.test(username)) return { error: "Username: 3–32 characters, letters, numbers, . _ -" };
  const problem = passwordProblem(password);
  if (problem) return { error: problem };
  try {
    await admins.createAdmin(username, await hashPassword(password), me.username);
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
  const updated = await admins.setPassword(me.id, await hashPassword(next));
  // Other devices are signed out (session version changed); keep this one signed in.
  await startSession(updated);
  return { ok: "Password changed. Other sessions were signed out." };
}

export async function deleteAdmin(id: string) {
  const me = await requireSession();
  if (id === me.id) return { error: "You can't remove yourself" };
  await admins.deleteAdmin(id, me.username);
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
  const me = await requireSession();
  const base = publicBaseUrl(String(formData.get("baseUrl") ?? ""));
  if (typeof base !== "string") return base;
  try {
    const cfg = await connectWebhook(base);
    await logActivity({ type: "webhook.connected", title: `Connected the Resend webhook (${cfg.endpoint})`, actor: me.username });
    revalidatePath("/settings");
    return { ok: `Connected: Resend will send events to ${cfg.endpoint}` };
  } catch (err) {
    return { error: `Resend: ${(err as Error).message}` };
  }
}

export async function rotateWebhookAction() {
  const me = await requireSession();
  try {
    await rotateWebhookSecret();
    await logActivity({ type: "webhook.rotated", title: "Rotated the webhook signing secret", actor: me.username });
    revalidatePath("/settings");
    return { ok: "Signing secret rotated" };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function disconnectWebhookAction() {
  const me = await requireSession();
  try {
    await disconnectWebhook();
    await logActivity({ type: "webhook.disconnected", title: "Removed the webhook from Resend", actor: me.username });
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

// ─── Status backfill ──────────────────────────────────────────────────────
// For mail sent before the webhook existed (or whose events were missed):
// ask Resend for each email's last event. 1 API call per email, on click only.

export async function refreshStuckStatuses() {
  const me = await requireSession();
  const result = await mail.refreshStuckStatuses(me.username);
  revalidatePath("/", "layout");
  return result;
}
