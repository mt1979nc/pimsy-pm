"use client";

import { useActionState, useTransition } from "react";
import { addLearningItem, updateLearningItem, uploadLearningItemFile, deleteLearningItem } from "@/actions/learning-center";
import { SubmitButton, FormError } from "@/components/submit-button";
import { Field, inputClass, Button } from "@/components/ui";

export function AddLearningItemForm({ sectionId }: { sectionId: string }) {
  const [state, action] = useActionState(addLearningItem, {});
  return (
    <form action={action} className="mt-3 space-y-2 border-t border-border px-5 py-3">
      <input type="hidden" name="sectionId" value={sectionId} />
      <div className="flex flex-wrap gap-2">
        <input name="title" required placeholder="New article title" className={inputClass} />
        <select name="kind" className={inputClass} defaultValue="ARTICLE">
          <option value="ARTICLE">Article</option>
          <option value="LINK">Link</option>
          <option value="FILE">File</option>
        </select>
        <select name="audienceRole" className={inputClass} defaultValue="all">
          <option value="all">Everyone</option>
          <option value="clinical">Clinical</option>
          <option value="billing">Billing</option>
          <option value="admin">Admin</option>
        </select>
        <SubmitButton size="sm">Add</SubmitButton>
      </div>
      <input name="summary" placeholder="Short summary" className={inputClass} />
      <FormError error={state.error} />
    </form>
  );
}

export function EditLearningItemForm({
  item,
}: {
  item: { id: string; title: string; summary: string | null; body: string | null; url: string | null; published: boolean };
}) {
  const [state, action] = useActionState(updateLearningItem, {});
  const [fileState, fileAction] = useActionState(uploadLearningItemFile, {});
  const [, start] = useTransition();
  return (
    <div className="space-y-3 border-t border-border px-5 py-3">
      <form action={action} className="space-y-2">
        <input type="hidden" name="itemId" value={item.id} />
        <Field label="Title" htmlFor={`title-${item.id}`}>
          <input id={`title-${item.id}`} name="title" defaultValue={item.title} required className={inputClass} />
        </Field>
        <Field label="Summary" htmlFor={`summary-${item.id}`}>
          <input id={`summary-${item.id}`} name="summary" defaultValue={item.summary ?? ""} className={inputClass} />
        </Field>
        <Field label="Body" htmlFor={`body-${item.id}`}>
          <textarea
            id={`body-${item.id}`}
            name="body"
            defaultValue={item.body ?? ""}
            rows={6}
            className={inputClass}
          />
        </Field>
        <Field label="External link" htmlFor={`url-${item.id}`}>
          <input id={`url-${item.id}`} name="url" defaultValue={item.url ?? ""} className={inputClass} />
        </Field>
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          <input type="checkbox" name="published" defaultChecked={item.published} />
          Published to the customer portal
        </label>
        <SubmitButton size="sm">Save</SubmitButton>
        <FormError error={state.error} />
      </form>
      <form action={fileAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="itemId" value={item.id} />
        <Field label="Replace file" htmlFor={`file-${item.id}`}>
          <input id={`file-${item.id}`} name="file" type="file" className="text-[13px]" />
        </Field>
        <SubmitButton size="sm" variant="secondary">
          Upload
        </SubmitButton>
        <FormError error={fileState.error} />
      </form>
      <Button
        type="button"
        size="sm"
        variant="danger"
        onClick={() => {
          start(async () => {
            await deleteLearningItem(item.id);
          });
        }}
      >
        Delete item
      </Button>
    </div>
  );
}
