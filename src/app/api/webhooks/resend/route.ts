import type { WebhookEventPayload } from "resend";
import { handleOutboundEvent } from "@/lib/events";
import { ingestInbound } from "@/lib/ingest";
import { resend } from "@/lib/resend";
import { webhookSecrets } from "@/lib/webhook-config";

export const maxDuration = 60;

export async function POST(req: Request) {
  const secrets = await webhookSecrets();
  if (!secrets.length) {
    return Response.json({ error: "Webhook not connected: use Settings → Webhook → Connect" }, { status: 503 });
  }

  const payload = await req.text();
  const id = req.headers.get("svix-id");
  const timestamp = req.headers.get("svix-timestamp");
  const signature = req.headers.get("svix-signature");
  if (!id || !timestamp || !signature) return Response.json({ error: "missing signature" }, { status: 401 });

  // Accept the current secret, a just-rotated one, or RESEND_WEBHOOK_SECRET.
  let event: WebhookEventPayload | null = null;
  for (const webhookSecret of secrets) {
    try {
      event = resend().webhooks.verify({ payload, headers: { id, timestamp, signature }, webhookSecret });
      break;
    } catch {
      // try the next secret
    }
  }
  if (!event) return Response.json({ error: "invalid signature" }, { status: 401 });

  try {
    if (event.type === "email.received") {
      await ingestInbound(event, id);
    } else if (event.type.startsWith("email.")) {
      await handleOutboundEvent(event as Parameters<typeof handleOutboundEvent>[0], id);
    }
    // contact.*, domain.*, topic.* events are acknowledged and ignored.
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[webhook] processing failed", event.type, err);
    // Non-2xx makes Resend retry with backoff; handlers are idempotent.
    return Response.json({ error: "processing failed" }, { status: 500 });
  }
}
