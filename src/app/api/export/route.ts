import { isAuthed } from "@/lib/api-auth";
import { utcDay } from "@/lib/mail-utils";
import { exportEmailsFlat, exportEmailsFull } from "@/services/mail.service";
import { allContacts } from "@/services/settings.service";

function csvCell(v: unknown) {
  const s = v == null ? "" : Array.isArray(v) ? v.join("; ") : v instanceof Date ? v.toISOString() : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  return [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n");
}

export async function GET(req: Request) {
  if (!(await isAuthed())) return new Response("Unauthorized", { status: 401 });
  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "json";
  const what = url.searchParams.get("what") === "contacts" ? "contacts" : "emails";
  const stamp = utcDay();

  let rows: Record<string, unknown>[];
  if (what === "contacts") rows = await allContacts();
  else if (format === "csv") rows = await exportEmailsFlat();
  else rows = await exportEmailsFull();

  const body = format === "csv" ? toCsv(rows) : JSON.stringify(rows, null, 2);
  return new Response(body, {
    headers: {
      "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/json",
      "Content-Disposition": `attachment; filename="easymail-${what}-${stamp}.${format}"`,
      "Cache-Control": "no-store",
    },
  });
}
