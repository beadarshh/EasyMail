import { eq } from "drizzle-orm";
import { attachments, db, emails } from "@/db";
import { isAuthed } from "@/lib/api-auth";
import { resend, throttled } from "@/lib/resend";
import { signedAttachmentUrl } from "@/lib/storage";

export async function GET(_req: Request, ctx: RouteContext<"/api/attachments/[id]">) {
  if (!(await isAuthed())) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });

  const [row] = await db()
    .select({ a: attachments, resendEmailId: emails.resendId, direction: emails.direction })
    .from(attachments)
    .innerJoin(emails, eq(emails.id, attachments.emailId))
    .where(eq(attachments.id, id));
  if (!row) return new Response("Not found", { status: 404 });

  // Archived copy: free, no Resend call.
  if (row.a.storagePath) {
    return Response.redirect(await signedAttachmentUrl(row.a.storagePath, row.a.filename), 302);
  }

  // Fallback: Resend keeps inbound attachments for 30 days (1 API call).
  if (row.direction === "inbound" && row.resendEmailId && row.a.resendAttachmentId) {
    const { data, error } = await throttled(() =>
      resend().emails.receiving.attachments.get({ emailId: row.resendEmailId!, id: row.a.resendAttachmentId! }),
    );
    if (data?.download_url) return Response.redirect(data.download_url, 302);
    return new Response(`Attachment no longer available from Resend: ${error?.message ?? "expired"}`, { status: 410 });
  }

  return new Response("This attachment wasn't archived.", { status: 410 });
}
