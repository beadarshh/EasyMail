"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { isValidEmail, splitAddressList } from "@/lib/mail-utils";
import { sendMail } from "@/services/send.service";

export type SendState = { error?: string } | undefined;

const schema = z.object({
  identityId: z.string().uuid({ message: "Choose a From address" }),
  to: z.array(z.string()).min(1, "Add at least one recipient").max(50),
  cc: z.array(z.string()).max(50),
  bcc: z.array(z.string()).max(50),
  subject: z.string().trim().max(998),
  html: z.string().max(2_000_000),
  replyToEmailId: z.string().uuid().optional(),
});

function htmlToText(html: string) {
  return html
    .replace(/<(br|\/p|\/div|\/li|\/h\d)>/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function sendEmail(_prev: SendState, formData: FormData): Promise<SendState> {
  const me = await requireSession();

  const parsed = schema.safeParse({
    identityId: formData.get("identityId"),
    to: splitAddressList(String(formData.get("to") ?? "")),
    cc: splitAddressList(String(formData.get("cc") ?? "")),
    bcc: splitAddressList(String(formData.get("bcc") ?? "")),
    subject: String(formData.get("subject") ?? ""),
    html: String(formData.get("html") ?? ""),
    replyToEmailId: formData.get("replyToEmailId") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid form" };
  const input = parsed.data;

  const bad = [...input.to, ...input.cc, ...input.bcc].find((a) => !isValidEmail(a));
  if (bad) return { error: `Invalid address: ${bad}` };

  const files = formData.getAll("attachments").filter((f): f is File => f instanceof File && f.size > 0);

  const result = await sendMail({ ...input, text: htmlToText(input.html), files, actor: me.username });
  if ("error" in result) return { error: result.error };
  redirect(`/thread/${result.threadId}#${result.emailId}`);
}
