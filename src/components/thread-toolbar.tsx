"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Archive, ArchiveRestore, ArrowLeft, MailOpen, Star, Trash2 } from "lucide-react";
import { deleteThread, setFlags } from "@/app/(app)/actions";
import { buttonStyles, cn } from "./ui";

type Props = { threadId: string; ids: string[]; starred: boolean; archived: boolean; back: string };

export function ThreadToolbar({ threadId, ids, starred, archived, back }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <div className={cn("flex flex-wrap items-center gap-1", pending && "opacity-60")}>
      <button onClick={() => router.push(back)} className={buttonStyles.ghost} aria-label="Back">
        <ArrowLeft className="size-4" />
      </button>
      <button onClick={() => start(() => setFlags(ids, { isStarred: !starred }))} className={buttonStyles.ghost} aria-label={starred ? "Unstar" : "Star"}>
        <Star className={cn("size-4", starred && "fill-amber-400 text-amber-400")} />
      </button>
      <button
        onClick={() =>
          start(async () => {
            await setFlags(ids, { isArchived: !archived });
            if (!archived) router.push(back);
          })
        }
        className={buttonStyles.ghost}
        aria-label={archived ? "Move to inbox" : "Archive"}
      >
        {archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
      </button>
      <button
        onClick={() =>
          start(async () => {
            await setFlags(ids, { isRead: false });
            router.push(back);
          })
        }
        className={buttonStyles.ghost}
        aria-label="Mark unread"
      >
        <MailOpen className="size-4" />
      </button>
      <button
        onClick={() => {
          if (!confirm("Permanently delete this conversation and its stored attachments from EasyMail?")) return;
          start(async () => {
            await deleteThread(threadId);
            router.push(back);
          });
        }}
        className={cn(buttonStyles.ghost, "hover:text-danger")}
        aria-label="Delete"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}
