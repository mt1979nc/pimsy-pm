"use client";

import { useTransition } from "react";
import { duplicateTemplate } from "@/actions/templates";
import { Button } from "@/components/ui";
import { suggestedCopyName } from "@/lib/playbook-meta";

export function DuplicateTemplateButton({
  templateId,
  name,
}: {
  templateId: string;
  name: string;
}) {
  const [pending, start] = useTransition();
  return (
    <form
      action={(formData) => {
        if (!confirm(`Duplicate “${name}” into a custom playbook? Live projects stay on the original.`)) {
          return;
        }
        start(() => duplicateTemplate(formData));
      }}
    >
      <input type="hidden" name="templateId" value={templateId} />
      <input type="hidden" name="name" value={suggestedCopyName(name)} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Copying…" : "Duplicate"}
      </Button>
    </form>
  );
}
