"use client";

import { useTransition } from "react";
import { setTemplateLocked } from "@/actions/templates";

export function TemplateLockButton({
  templateId,
  locked,
}: {
  templateId: string;
  locked: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => setTemplateLocked(templateId, !locked))}
      className="text-[12.5px] font-medium text-ink-2 underline-offset-2 hover:text-ink hover:underline disabled:opacity-50"
    >
      {locked ? "Unlock to edit" : "Lock playbook"}
    </button>
  );
}
