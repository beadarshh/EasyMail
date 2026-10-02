import { asc, eq } from "drizzle-orm";
import { contacts, db, emails, projects } from "@/db";
import { isAuthed } from "@/lib/api-auth";
import { utcDay } from "@/lib/mail-utils";

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
  if (what === "contacts") {
    rows = await db().select().from(contacts).orderBy(asc(contacts.address));
  } else if (format === "csv") {
    rows = await db()
      .select({
        id: emails.id,
        direction: emails.direction,
        source: emails.source,
        project: projects.name,
        sentAt: emails.sentAt,
        from: emails.fromAddress,
        to: emails.to,
        cc: emails.cc,
        subject: emails.subject,
        status: emails.status,
        opens: emails.opens,
        clicks: emails.clicks,
        deliveredAt: emails.deliveredAt,
        firstOpenedAt: emails.firstOpenedAt,
        threadId: emails.threadId,
        text: emails.text,
      })
      .from(emails)
      .leftJoin(projects, eq(projects.id, emails.projectId))
      .orderBy(asc(emails.sentAt));
  } else {
    rows = await db().select().from(emails).orderBy(asc(emails.sentAt));
  }

  const body = format === "csv" ? toCsv(rows) : JSON.stringify(rows, null, 2);
  return new Response(body, {
    headers: {
      "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/json",
      "Content-Disposition": `attachment; filename="easymail-${what}-${stamp}.${format}"`,
      "Cache-Control": "no-store",
    },
  });
}
