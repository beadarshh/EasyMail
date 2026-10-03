import type { Metadata } from "next";
import { headers } from "next/headers";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { ChangePasswordForm, DeleteAdminButton, NewAdminForm } from "@/components/admin-forms";
import { SyncUsageButton } from "@/components/sync-usage-button";
import { WebhookManager } from "@/components/webhook-manager";
import { buttonStyles, Card, Meter, PageHeader } from "@/components/ui";
import { env, storageEnabled } from "@/lib/env";
import { DISPLAY_TZ, formatFull } from "@/lib/format";
import { getSetting } from "@/services/settings.service";
import { requireSession } from "@/lib/auth";
import { listAdmins } from "@/services/admin.service";
import { webhookHealth } from "@/services/mail.service";
import { getWebhookConfig } from "@/lib/webhook-config";

export const metadata: Metadata = { title: "Settings" };

type UsageSnapshot = {
  daily: { used: number; limit: number | null; sent: number; received: number; resets_at: string };
  monthly: { used: number; limit: number; sent: number; received: number; resets_at: string };
  rate_limit?: { limit: number; duration: string };
  domains?: { used: number; limit: number | null };
  fetchedAt: string;
};

function Check({ ok, label, hint }: { ok: boolean; label: string; hint?: React.ReactNode }) {
  return (
    <li className="flex gap-3 py-2">
      {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />}
      <div>
        <p className="text-sm">{label}</p>
        {hint && <div className="text-xs text-muted">{hint}</div>}
      </div>
    </li>
  );
}

export default async function SettingsPage() {
  const e = env();
  const [me, h, adminList, { lastAt: lastHook, fresh: hookFresh }, usage, hook] = await Promise.all([
    requireSession(),
    headers(),
    listAdmins(),
    webhookHealth(),
    getSetting<UsageSnapshot>("resend_usage"),
    getWebhookConfig(),
  ]);
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const hookReady = !!hook || !!e.RESEND_WEBHOOK_SECRET;

  return (
    <>
      <PageHeader title="Settings" subtitle="Webhook, health, limits, admins and data." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-medium">Setup checklist</h2>
          <ul className="divide-y divide-border">
            <Check
              ok={hookReady}
              label="Resend webhook connected"
              hint={hook ? <span className="break-all">{hook.endpoint}</span> : e.RESEND_WEBHOOK_SECRET ? "Using RESEND_WEBHOOK_SECRET" : "Use the Webhook card below to connect it."}
            />
            <Check ok={hookFresh} label="Webhook events arriving" hint={lastHook ? `Last event ${formatFull(lastHook)} (${DISPLAY_TZ})` : "No events received yet"} />
            <Check
              ok={storageEnabled()}
              label="Attachment archive (Supabase Storage)"
              hint={storageEnabled() ? `Bucket "${e.SUPABASE_BUCKET}" · archiving ${e.ARCHIVE_ATTACHMENTS ? "on" : "off"}` : "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY)"}
            />
            <Check ok={!!e.CRON_SECRET} label="Daily cron secured" hint="Set CRON_SECRET; Vercel sends it to /api/cron/daily." />
          </ul>
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium">Resend usage (authoritative)</h2>
          </div>
          {usage ? (
            <div className="space-y-3 text-sm">
              <div>
                <div className="mb-1 flex justify-between text-xs text-muted">
                  <span>Today</span>
                  <span className="tabular-nums">
                    {usage.daily.used}/{usage.daily.limit ?? "∞"}
                  </span>
                </div>
                <Meter value={usage.daily.used} max={usage.daily.limit ?? usage.daily.used + 1} />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs text-muted">
                  <span>Month</span>
                  <span className="tabular-nums">
                    {usage.monthly.used}/{usage.monthly.limit}
                  </span>
                </div>
                <Meter value={usage.monthly.used} max={usage.monthly.limit} />
              </div>
              <p className="text-xs text-muted">
                Rate limit {usage.rate_limit?.limit ?? "?"} req/{usage.rate_limit?.duration ?? "s"} · domains {usage.domains?.used ?? "?"}/
                {usage.domains?.limit ?? "∞"} · fetched {formatFull(new Date(usage.fetchedAt))}
              </p>
            </div>
          ) : (
            <p className="mb-3 text-sm text-muted">Not synced yet. The daily cron syncs it automatically.</p>
          )}
          <div className="mt-4">
            <SyncUsageButton />
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-sm font-medium">Limits</h2>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-muted">Daily cap (sent + received)</dt>
            <dd className="text-right tabular-nums">{e.DAILY_SEND_CAP}</dd>
            <dt className="text-muted">Warn at</dt>
            <dd className="text-right tabular-nums">{e.DAILY_WARN_AT}</dd>
            <dt className="text-muted">Monthly cap</dt>
            <dd className="text-right tabular-nums">{e.MONTHLY_CAP}</dd>
            <dt className="text-muted">Outgoing attachments</dt>
            <dd className="text-right tabular-nums">{e.MAX_ATTACHMENT_MB} MB / email</dd>
            <dt className="text-muted">Archive inbound up to</dt>
            <dd className="text-right tabular-nums">{e.ARCHIVE_MAX_MB} MB / file</dd>
            <dt className="text-muted">Display timezone</dt>
            <dd className="text-right">{DISPLAY_TZ}</dd>
          </dl>
          <p className="mt-3 text-xs text-muted">Change these with environment variables (see .env.example), then redeploy.</p>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-sm font-medium">Export</h2>
          <p className="mb-3 text-sm text-muted">Download your full archive. Your data is yours, and nothing calls Resend.</p>
          <div className="flex flex-wrap gap-2">
            <a href="/api/export?format=json" className={buttonStyles.secondary}>
              Emails (JSON)
            </a>
            <a href="/api/export?format=csv" className={buttonStyles.secondary}>
              Emails (CSV)
            </a>
            <a href="/api/export?format=csv&what=contacts" className={buttonStyles.secondary}>
              Contacts (CSV)
            </a>
          </div>
        </Card>
        <Card className="p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-medium">Resend webhook</h2>
          <WebhookManager connected={hook ? { endpoint: hook.endpoint, connectedAt: hook.connectedAt } : null} suggestedUrl={origin} />
        </Card>

        <Card className="p-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-medium">Admins</h2>
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <ul className="mb-4 divide-y divide-border">
                {adminList.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 py-2 text-sm">
                    <span className="flex-1 font-medium">
                      {a.username}
                      {a.id === me.id && <span className="ml-2 text-xs font-normal text-muted">(you)</span>}
                    </span>
                    <span className="text-xs text-muted">{a.lastLoginAt ? `last sign-in ${formatFull(a.lastLoginAt)}` : "never signed in"}</span>
                    {a.id !== me.id && <DeleteAdminButton id={a.id} username={a.username} />}
                  </li>
                ))}
              </ul>
              <p className="mb-2 text-xs font-medium text-muted">Add an admin</p>
              <NewAdminForm />
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-muted">Change your password</p>
              <ChangePasswordForm />
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
