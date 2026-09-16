"use client";

import { useEffect } from "react";
import { markThreadRead } from "@/actions/messages";

/** Writes lastReadAt after paint. Must not run inside an RSC render — Next 15
 *  refuses revalidatePath during render, which is how mark-read refreshes Inbox. */
export function MarkThreadRead({ threadId }: { threadId: string }) {
  useEffect(() => {
    void markThreadRead(threadId);
  }, [threadId]);
  return null;
}
