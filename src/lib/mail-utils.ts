// Pure helpers (no server-only imports) so they can be unit tested.

export function parseAddress(input: string): { name: string | null; address: string } {
  const m = input.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || null, address: m[2].trim().toLowerCase() };
  return { name: null, address: input.trim().toLowerCase() };
}

export function formatAddress(name: string | null | undefined, address: string) {
  if (!name) return address;
  const safe = name.replace(/["\\]/g, "");
  return `"${safe}" <${address}>`;
}

export function splitAddressList(input: string): string[] {
  return input
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
export function isValidEmail(input: string) {
  return EMAIL_RE.test(parseAddress(input).address);
}

/** UTC calendar day as YYYY-MM-DD — Resend's daily quota resets at midnight UTC. */
export function utcDay(d: Date = new Date()) {
  return d.toISOString().slice(0, 10);
}

export function utcMonthStart(d: Date = new Date()) {
  return `${d.toISOString().slice(0, 7)}-01`;
}

export function normalizeMessageId(id: string | null | undefined): string | null {
  if (!id) return null;
  const t = id.trim();
  if (!t) return null;
  return t.startsWith("<") ? t : `<${t}>`;
}

/** Extract every <message-id> token from a References / In-Reply-To header. */
export function parseMessageIds(header: string | null | undefined): string[] {
  if (!header) return [];
  return header.match(/<[^<>\s]+>/g) ?? [];
}

export function headerValue(headers: Record<string, string> | null | undefined, name: string) {
  if (!headers) return null;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : null;
}

export function replySubject(subject: string) {
  return /^\s*re:/i.test(subject) ? subject : `Re: ${subject}`;
}

export function forwardSubject(subject: string) {
  return /^\s*fwd?:/i.test(subject) ? subject : `Fwd: ${subject}`;
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export type QuotaInput = {
  sentToday: number;
  receivedToday: number;
  monthUsed: number;
  dailyCap: number;
  warnAt: number;
  monthlyCap: number;
};

export type QuotaCheck = {
  allowed: boolean;
  level: "ok" | "warn" | "blocked";
  usedToday: number;
  remainingToday: number;
  remainingMonth: number;
  reason?: string;
};

/**
 * Sent and received mail both count toward Resend's free-tier quota.
 * `dailyCap` is kept below Resend's hard 100/day so inbound mail still has room.
 */
export function checkQuota(q: QuotaInput, toSend = 1): QuotaCheck {
  const usedToday = q.sentToday + q.receivedToday;
  const remainingToday = Math.max(0, q.dailyCap - usedToday);
  const remainingMonth = Math.max(0, q.monthlyCap - q.monthUsed);
  const base = { usedToday, remainingToday, remainingMonth };
  if (toSend > remainingToday) {
    return { ...base, allowed: false, level: "blocked", reason: `Daily cap reached (${usedToday}/${q.dailyCap} today, resets 00:00 UTC)` };
  }
  if (toSend > remainingMonth) {
    return { ...base, allowed: false, level: "blocked", reason: `Monthly cap reached (${q.monthUsed}/${q.monthlyCap})` };
  }
  const level = usedToday + toSend >= q.warnAt || q.monthUsed + toSend >= q.monthlyCap * 0.9 ? "warn" : "ok";
  return { ...base, allowed: true, level };
}
