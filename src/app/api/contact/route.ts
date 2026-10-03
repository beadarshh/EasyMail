import { z } from "zod";
import { buildContactMessage, originAllowed } from "@/lib/api-keys";
import { logActivity } from "@/services/activity.service";
import { findActiveKey, touchApiKey } from "@/services/api-key.service";
import { sendMail } from "@/services/send.service";

export const maxDuration = 30;

/**
 * Public contact-form endpoint:  POST /api/contact
 *
 *   x-api-key: em_...            (or  Authorization: Bearer em_...)
 *   { "name", "email", "message", "phone"?, "organization"?, "subject"? }
 *
 * The key decides which project, From address and recipient are used, and which website domains
 * may call it. The browser's Origin header must match one of the key's domains.
 */

const body = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(200),
  message: z.string().trim().min(1).max(5000),
  phone: z.string().trim().max(40).optional(),
  organization: z.string().trim().max(120).optional(),
  subject: z.string().trim().max(150).optional(),
  // Honeypot: real visitors never see or fill this field.
  website: z.string().optional(),
});

function cors(origin: string | null): Record<string, string> {
  return origin
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, x-api-key, Authorization",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin",
      }
    : {};
}

function reply(data: Record<string, unknown>, status: number, origin: string | null) {
  return Response.json(data, { status, headers: { ...cors(origin), "Cache-Control": "no-store" } });
}

// Best-effort limit per key + visitor IP. Instances don't share memory, so the daily quota guard
// in sendMail is the hard stop.
const hits = new Map<string, number[]>();
function rateLimited(id: string) {
  const now = Date.now();
  const recent = (hits.get(id) ?? []).filter((t) => now - t < 10 * 60_000);
  if (recent.length >= 5) return true;
  hits.set(id, [...recent, now]);
  if (hits.size > 5000) hits.clear();
  return false;
}

// Preflight requests cannot carry the key, so this only answers the CORS handshake; the POST
// itself is still checked against the key's allowed domains.
export function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: cors(req.headers.get("origin")) });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const auth = req.headers.get("authorization");
  const raw = req.headers.get("x-api-key") ?? (auth?.startsWith("Bearer ") ? auth.slice(7) : null);
  if (!raw) return reply({ error: "Missing API key" }, 401, null);

  const found = await findActiveKey(raw.trim());
  if (!found) return reply({ error: "Invalid or revoked API key" }, 401, null);
  const { key, projectName } = found;

  if (!originAllowed(origin ?? req.headers.get("referer"), key.allowedOrigins)) {
    await logActivity({
      type: "contact.rejected",
      title: `API key "${key.name}" used from a domain that isn't allowed`,
      projectId: key.projectId,
      meta: { origin },
    });
    return reply({ error: "This API key is not allowed for this website" }, 403, null);
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(`${key.id}:${ip}`)) return reply({ error: "Too many messages. Try again in a few minutes." }, 429, origin);

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return reply({ error: "Name, a valid email and a message are required" }, 400, origin);
  const data = parsed.data;
  if (data.website) return reply({ ok: true }, 200, origin); // bot: pretend it worked

  if (!key.identityId) return reply({ error: "This API key has no From address. Set one in EasyMail." }, 500, origin);

  const msg = buildContactMessage(projectName ?? key.name, data);
  const result = await sendMail({
    identityId: key.identityId,
    to: [key.toAddress],
    cc: [],
    bcc: [],
    replyTo: data.email,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
    files: [],
    actor: `api:${key.name}`,
  });
  if ("error" in result) {
    console.error("[contact] send failed", result.error);
    return reply({ error: "Could not send the message right now" }, 502, origin);
  }

  await touchApiKey(key.id).catch(() => {});
  return reply({ ok: true }, 200, origin);
}
