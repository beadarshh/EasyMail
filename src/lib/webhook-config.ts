import "server-only";
import type { WebhookEvent } from "resend";
import { env } from "./env";
import { deleteSetting, getSetting, setSetting } from "@/services/settings.service";
import { resend, throttled } from "./resend";

/** Every email.* event EasyMail understands. contact/domain/topic events aren't needed. */
export const WEBHOOK_EVENTS: WebhookEvent[] = [
  "email.received",
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.bounced",
  "email.complained",
  "email.opened",
  "email.clicked",
  "email.failed",
  "email.suppressed",
  "email.scheduled",
];

const KEY = "resend_webhook";

export type WebhookConfig = {
  id: string;
  endpoint: string;
  secret: string;
  // Kept briefly after a rotation so in-flight deliveries still verify.
  previousSecret?: string;
  previousUntil?: string;
  connectedAt: string;
};

export const getWebhookConfig = () => getSetting<WebhookConfig>(KEY);

/** Secrets accepted by the webhook route: the stored one(s), plus RESEND_WEBHOOK_SECRET if set. */
export async function webhookSecrets(): Promise<string[]> {
  const cfg = await getWebhookConfig();
  const list = [cfg?.secret, env().RESEND_WEBHOOK_SECRET];
  if (cfg?.previousSecret && cfg.previousUntil && Date.parse(cfg.previousUntil) > Date.now()) list.push(cfg.previousSecret);
  return [...new Set(list.filter((s): s is string => !!s))];
}

export function endpointFor(base: string) {
  return `${base.replace(/\/+$/, "")}/api/webhooks/resend`;
}

/**
 * Creates the webhook in Resend, or re-uses one already pointing at this endpoint
 * (re-enabling it and resetting its events). 2–3 API calls, only when you click.
 */
export async function connectWebhook(baseUrl: string): Promise<WebhookConfig> {
  const endpoint = endpointFor(baseUrl);
  const r = resend();

  const list = await throttled(() => r.webhooks.list());
  if (list.error) throw new Error(list.error.message);
  const existing = list.data?.data.find((w) => w.endpoint === endpoint);

  let id: string;
  let secret: string;
  if (existing) {
    const upd = await throttled(() => r.webhooks.update(existing.id, { endpoint, events: WEBHOOK_EVENTS, status: "enabled" }));
    if (upd.error) throw new Error(upd.error.message);
    const got = await throttled(() => r.webhooks.get(existing.id));
    if (got.error || !got.data) throw new Error(got.error?.message ?? "Could not read webhook");
    id = existing.id;
    secret = got.data.signing_secret;
  } else {
    const created = await throttled(() => r.webhooks.create({ endpoint, events: WEBHOOK_EVENTS }));
    if (created.error || !created.data) throw new Error(created.error?.message ?? "Could not create webhook");
    id = created.data.id;
    secret = created.data.signing_secret;
  }

  const cfg: WebhookConfig = { id, endpoint, secret, connectedAt: new Date().toISOString() };
  await setSetting(KEY, cfg);
  return cfg;
}

export async function rotateWebhookSecret() {
  const cfg = await getWebhookConfig();
  if (!cfg) throw new Error("No webhook connected");
  const { data, error } = await throttled(() => resend().webhooks.rotateSigningSecret(cfg.id));
  if (error || !data) throw new Error(error?.message ?? "Rotation failed");
  await setSetting(KEY, {
    ...cfg,
    secret: data.signing_secret,
    previousSecret: cfg.secret,
    previousUntil: new Date(Date.now() + 24 * 3600_000).toISOString(),
  } satisfies WebhookConfig);
}

export async function disconnectWebhook() {
  const cfg = await getWebhookConfig();
  if (!cfg) return;
  const { error } = await throttled(() => resend().webhooks.remove(cfg.id));
  // Already deleted in the dashboard is fine.
  if (error && !/not.?found/i.test(error.message)) throw new Error(error.message);
  await deleteSetting(KEY);
}

export async function recentDeliveries(limit = 15) {
  const cfg = await getWebhookConfig();
  if (!cfg) return [];
  const { data, error } = await throttled(() => resend().webhooks.events.list({ webhookId: cfg.id, limit }));
  if (error) throw new Error(error.message);
  return data?.data ?? [];
}

export async function replayDelivery(eventId: string) {
  const cfg = await getWebhookConfig();
  if (!cfg) throw new Error("No webhook connected");
  const { error } = await throttled(() => resend().webhooks.events.replay({ webhookId: cfg.id, eventId }));
  if (error) throw new Error(error.message);
}
