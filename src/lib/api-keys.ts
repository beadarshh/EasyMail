// Pure helpers (no server-only imports) so they can be unit tested.
import { createHash, randomBytes } from "node:crypto";

export const KEY_PREFIX = "em_";

/** A new random key, e.g. `em_3f9a…`. Shown to the admin once; only its hash is stored. */
export function generateApiKey() {
  const key = `${KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
  return { key, hash: hashApiKey(key), prefix: key.slice(0, 10) };
}

export function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

/** Accepts `example.com`, `https://www.example.com/path` or `localhost:5173`; returns a lowercase hostname or null. */
export function normalizeHost(input: string): string | null {
  const raw = input.trim().toLowerCase();
  if (!raw) return null;
  try {
    const host = new URL(/^[a-z]+:\/\//.test(raw) ? raw : `https://${raw}`).hostname;
    return /^[a-z0-9.-]+$/.test(host) && !host.startsWith(".") ? host : null;
  } catch {
    return null;
  }
}

export function parseHosts(input: string): string[] {
  const hosts = input
    .split(/[\s,;]+/)
    .map(normalizeHost)
    .filter((h): h is string => !!h);
  return [...new Set(hosts)];
}

/** The request's Origin (or Referer) host must be one of the key's allowed hosts. */
export function originAllowed(origin: string | null, allowed: string[]) {
  if (!origin) return false;
  const host = normalizeHost(origin);
  return !!host && allowed.includes(host);
}

export function escapeHtml(s: string) {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return s.replace(/[&<>"']/g, (c) => map[c]);
}

export type ContactFields = { name: string; email: string; phone?: string; organization?: string; message: string; subject?: string };

/** Subject, HTML and plain-text bodies for a contact-form message. Every visitor value is escaped. */
export function buildContactMessage(projectName: string, f: ContactFields) {
  const rows: [string, string][] = [["From", `${f.name} <${f.email}>`]];
  if (f.organization) rows.push(["Organization", f.organization]);
  if (f.phone) rows.push(["Phone", f.phone]);

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;line-height:1.6">
<h2 style="margin:0 0 4px">New message from ${escapeHtml(projectName)}</h2>
<p style="margin:0 0 20px;opacity:.6;font-size:13px">Sent through the contact form. Reply to this email to answer ${escapeHtml(f.name)}.</p>
${rows.map(([k, v]) => `<p style="margin:0 0 8px"><b>${k}:</b> ${escapeHtml(v)}</p>`).join("\n")}
<div style="margin-top:16px;padding:16px;border:1px solid rgba(128,128,128,.35);border-radius:10px;white-space:pre-wrap">${escapeHtml(f.message)}</div>
</div>`;
  const text = [`New message from ${projectName}`, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", f.message].join("\n");
  const oneLine = (s: string, max: number) => s.replace(/[\r\n]+/g, " ").trim().slice(0, max);
  const subject = f.subject ? `${projectName}: ${oneLine(f.subject, 100)}` : `${projectName}: new message from ${oneLine(f.name, 80)}`;
  return { subject, html, text };
}
