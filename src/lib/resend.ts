import "server-only";
import { Resend } from "resend";
import { env } from "./env";

let client: Resend | undefined;

export function resend() {
  if (!client) client = new Resend(env().RESEND_API_KEY);
  return client;
}

// Resend allows 10 req/s per team. Space our calls out (≤ 8/s) so a burst of
// inbound webhooks never trips a 429. Per-instance, which is enough at our volume.
const MIN_GAP_MS = 125;
let nextSlot = 0;

export async function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + MIN_GAP_MS;
  if (wait) await new Promise((r) => setTimeout(r, wait));
  return fn();
}
