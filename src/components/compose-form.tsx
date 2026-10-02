"use client";

import { useActionState, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, Link2, List, ListOrdered, Paperclip, Quote, Send, X } from "lucide-react";
import { sendEmail } from "@/app/(app)/compose/actions";
import { buttonStyles, Card, cn } from "./ui";

type IdentityOption = { id: string; label: string };

type Props = {
  identities: IdentityOption[];
  defaults: { identityId?: string; to?: string; cc?: string; subject?: string; html?: string; replyToEmailId?: string };
  quota: { allowed: boolean; level: "ok" | "warn" | "blocked"; remainingToday: number; remainingMonth: number; reason?: string };
  maxAttachmentMb: number;
};

export function ComposeForm({ identities, defaults, quota, maxAttachmentMb }: Props) {
  const [state, action, pending] = useActionState(sendEmail, undefined);
  const [html, setHtml] = useState(defaults.html ?? "");
  const [showCc, setShowCc] = useState(!!defaults.cc);
  const [files, setFiles] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [StarterKit.configure({ link: { openOnClick: false, autolink: true } })],
    content: defaults.html ?? "",
    immediatelyRender: false,
    onUpdate: ({ editor }) => setHtml(editor.getHTML()),
  });

  const totalMb = files.reduce((a, f) => a + f.size, 0) / 1024 / 1024;
  const tooBig = totalMb > maxAttachmentMb;

  function syncFiles(next: File[]) {
    setFiles(next);
    // Keep the real <input type=file> in sync so FormData carries the files.
    const dt = new DataTransfer();
    next.forEach((f) => dt.items.add(f));
    if (fileInput.current) fileInput.current.files = dt.files;
  }

  if (!identities.length) {
    return (
      <Card className="p-6 text-sm">
        Add a sending address under <a href="/projects" className="text-accent underline">Projects</a> first. It must be on a
        domain verified in Resend.
      </Card>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {defaults.replyToEmailId && <input type="hidden" name="replyToEmailId" value={defaults.replyToEmailId} />}
      <input type="hidden" name="html" value={html} />

      {quota.level !== "ok" && (
        <div
          className={cn(
            "rounded-lg px-4 py-3 text-sm",
            quota.allowed ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-danger/10 text-danger",
          )}
        >
          {quota.allowed
            ? `Heads up: ${quota.remainingToday} sends left today, ${quota.remainingMonth} this month (free tier).`
            : quota.reason}
        </div>
      )}

      <Card className="divide-y divide-border">
        <Row label="From">
          <select name="identityId" defaultValue={defaults.identityId ?? identities[0].id} className="w-full bg-transparent text-sm outline-none">
            {identities.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </select>
        </Row>
        <Row label="To">
          <input name="to" defaultValue={defaults.to} required placeholder="name@example.com, …" className="w-full bg-transparent text-sm outline-none" />
          {!showCc && (
            <button type="button" onClick={() => setShowCc(true)} className="text-xs text-muted hover:text-fg">
              Cc/Bcc
            </button>
          )}
        </Row>
        {showCc && (
          <>
            <Row label="Cc">
              <input name="cc" defaultValue={defaults.cc} className="w-full bg-transparent text-sm outline-none" />
            </Row>
            <Row label="Bcc">
              <input name="bcc" className="w-full bg-transparent text-sm outline-none" />
            </Row>
          </>
        )}
        <Row label="Subject">
          <input name="subject" defaultValue={defaults.subject} className="w-full bg-transparent text-sm outline-none" />
        </Row>
        <div>
          <Toolbar editor={editor} />
          <EditorContent editor={editor} className="text-sm" />
        </div>
      </Card>

      <input
        ref={fileInput}
        type="file"
        name="attachments"
        multiple
        className="hidden"
        onChange={(e) => syncFiles([...files, ...Array.from(e.target.files ?? [])])}
      />
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <span key={`${f.name}-${i}`} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs">
              <Paperclip className="size-3.5 text-muted" />
              <span className="max-w-48 truncate">{f.name}</span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => syncFiles(files.filter((_, j) => j !== i))}>
                <X className="size-3.5 text-muted hover:text-fg" />
              </button>
            </span>
          ))}
          <span className={cn("self-center text-xs", tooBig ? "text-danger" : "text-muted")}>
            {totalMb.toFixed(1)} / {maxAttachmentMb} MB
          </span>
        </div>
      )}

      {state?.error && <p className="text-sm text-danger">{state.error}</p>}

      <div className="flex items-center justify-between">
        <button type="button" onClick={() => fileInput.current?.click()} className={buttonStyles.secondary}>
          <Paperclip className="size-4" /> Attach
        </button>
        <button type="submit" disabled={pending || !quota.allowed || tooBig} className={buttonStyles.primary}>
          <Send className="size-4" /> {pending ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-3 px-4 py-2.5">
      <span className="w-14 shrink-0 text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}

function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return <div className="h-10 border-b border-border" />;
  const btn = (active: boolean) => cn(buttonStyles.ghost, "h-8 w-8 p-0", active && "bg-surface-2 text-fg");
  return (
    <div className="flex gap-1 border-b border-border px-2 py-1">
      <button type="button" aria-label="Bold" className={btn(editor.isActive("bold"))} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="size-4" />
      </button>
      <button type="button" aria-label="Italic" className={btn(editor.isActive("italic"))} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Link"
        className={btn(editor.isActive("link"))}
        onClick={() => {
          const prev = editor.getAttributes("link").href as string | undefined;
          const url = prompt("Link URL", prev ?? "https://");
          if (url === null) return;
          if (!url) editor.chain().focus().unsetLink().run();
          else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
        }}
      >
        <Link2 className="size-4" />
      </button>
      <button type="button" aria-label="Bullet list" className={btn(editor.isActive("bulletList"))} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="size-4" />
      </button>
      <button type="button" aria-label="Numbered list" className={btn(editor.isActive("orderedList"))} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="size-4" />
      </button>
      <button type="button" aria-label="Quote" className={btn(editor.isActive("blockquote"))} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote className="size-4" />
      </button>
    </div>
  );
}
