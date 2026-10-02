"use client";

import { useActionState, useState, useTransition } from "react";
import { History, Link2, RefreshCw, RotateCcw, Unlink } from "lucide-react";
import {
  connectWebhookAction,
  disconnectWebhookAction,
  loadDeliveriesAction,
  replayDeliveryAction,
  rotateWebhookAction,
} from "@/app/(app)/actions";
import { buttonStyles, cn, inputStyles } from "./ui";

type Delivery = { id: string; type: string; created_at: string; status: "success" | "pending" | "failed" | "attempting" };
type Msg = { error?: string; ok?: string | boolean } | undefined;

const STATUS_TONE: Record<Delivery["status"], string> = {
  success: "text-emerald-600 dark:text-emerald-400",
  pending: "text-muted",
  attempting: "text-amber-600 dark:text-amber-400",
  failed: "text-danger",
};

function Note({ msg }: { msg: Msg }) {
  if (msg?.error) return <p className="text-sm text-danger">{msg.error}</p>;
  if (typeof msg?.ok === "string") return <p className="text-sm text-emerald-600 dark:text-emerald-400">{msg.ok}</p>;
  return null;
}

export function WebhookManager({ connected, suggestedUrl }: { connected: { endpoint: string; connectedAt: string } | null; suggestedUrl: string }) {
  const [state, connect, connecting] = useActionState(connectWebhookAction, undefined);
  const [msg, setMsg] = useState<Msg>();
  const [deliveries, setDeliveries] = useState<Delivery[] | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<Msg>) => start(async () => setMsg(await fn()));

  return (
    <div className="space-y-4">
      <form action={connect} className="space-y-2">
        <label htmlFor="baseUrl" className="block text-xs font-medium text-muted">
          App URL Resend should call
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="baseUrl"
            name="baseUrl"
            defaultValue={connected ? new URL(connected.endpoint).origin : suggestedUrl}
            placeholder="https://easymail.vercel.app"
            className={cn(inputStyles, "min-w-56 flex-1")}
          />
          <button disabled={connecting} className={buttonStyles.primary}>
            <Link2 className="size-4" /> {connected ? "Reconnect" : "Connect webhook"}
          </button>
        </div>
        <p className="text-xs text-muted">
          Registers <code>/api/webhooks/resend</code> with every <code>email.*</code> event and stores the signing secret here, so
          you don&apos;t need <code>RESEND_WEBHOOK_SECRET</code>. Reconnecting re-uses the existing webhook.
        </p>
        <Note msg={state} />
      </form>

      {connected && (
        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              className={buttonStyles.secondary}
              onClick={() =>
                start(async () => {
                  const r = await loadDeliveriesAction();
                  if ("error" in r) setMsg({ error: r.error });
                  else setDeliveries(r.deliveries as Delivery[]);
                })
              }
            >
              <History className="size-4" /> Recent deliveries
            </button>
            <button
              type="button"
              disabled={pending}
              className={buttonStyles.secondary}
              onClick={() => confirm("Rotate the signing secret? The old one keeps working for 24 hours.") && run(rotateWebhookAction)}
            >
              <RefreshCw className="size-4" /> Rotate secret
            </button>
            <button
              type="button"
              disabled={pending}
              className={buttonStyles.danger}
              onClick={() => confirm("Remove the webhook from Resend? New mail and delivery events will stop arriving.") && run(disconnectWebhookAction)}
            >
              <Unlink className="size-4" /> Disconnect
            </button>
          </div>
          <Note msg={msg} />

          {deliveries && (
            <div className="overflow-x-auto">
              {deliveries.length === 0 ? (
                <p className="text-sm text-muted">No deliveries yet.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-muted">
                      <th className="pb-1 font-medium">Event</th>
                      <th className="pb-1 font-medium">Status</th>
                      <th className="pb-1 font-medium">When</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {deliveries.map((d) => (
                      <tr key={d.id}>
                        <td className="py-1.5 pr-3 font-mono">{d.type}</td>
                        <td className={cn("py-1.5 pr-3 capitalize", STATUS_TONE[d.status])}>{d.status}</td>
                        <td className="py-1.5 pr-3 text-muted tabular-nums">{new Date(d.created_at).toLocaleString()}</td>
                        <td className="py-1.5 text-right">
                          {d.status === "failed" && (
                            <button
                              type="button"
                              disabled={pending}
                              className={buttonStyles.ghost}
                              onClick={() =>
                                run(async () => {
                                  const r = await replayDeliveryAction(d.id);
                                  return "error" in r ? r : { ok: `Replayed ${d.type}` };
                                })
                              }
                            >
                              <RotateCcw className="size-3.5" /> Replay
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="mt-2 text-[11px] text-muted">Each button uses 1 Resend API call. Nothing here polls.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
