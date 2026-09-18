"use client";

import { useActionState, useState } from "react";
import {
  addLibraryFile,
  addLibraryLink,
  saveLibraryLink,
  uploadLibraryFile,
} from "@/actions/library";
import { SubmitButton, FormError } from "@/components/submit-button";
import { Button, inputClass } from "@/components/ui";

const MODES = ["file", "image", "link"] as const;
type Mode = (typeof MODES)[number];

const MODE_LABEL: Record<Mode, string> = {
  file: "File",
  image: "Image",
  link: "Link",
};

export function LibraryUploadForm({ assetId }: { assetId: string }) {
  const [state, action] = useActionState(uploadLibraryFile, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="assetId" value={assetId} />
      <input name="file" type="file" required className="text-[13px]" />
      <SubmitButton size="sm">Replace file</SubmitButton>
      <FormError error={state.error} />
    </form>
  );
}

export function LibraryLinkEditForm({
  assetId,
  name,
  url,
  description,
}: {
  assetId: string;
  name: string;
  url: string;
  description: string | null;
}) {
  const [state, action] = useActionState(saveLibraryLink, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="assetId" value={assetId} />
      <input name="name" defaultValue={name} required className={inputClass} placeholder="Title" />
      <input name="url" defaultValue={url} required className={inputClass} placeholder="https://" />
      <input
        name="description"
        defaultValue={description ?? ""}
        className={inputClass}
        placeholder="Note (optional)"
      />
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton size="sm">Save link</SubmitButton>
        <FormError error={state.error} />
      </div>
    </form>
  );
}

function VisibilitySelect() {
  return (
    <select name="visibility" defaultValue="SHARED" className={inputClass}>
      <option value="SHARED">Shared with customer</option>
      <option value="INTERNAL">Team only</option>
    </select>
  );
}

export function AddLibraryItemForms() {
  const [mode, setMode] = useState<Mode>("link");
  const [linkState, linkAction] = useActionState(addLibraryLink, {});
  const [fileState, fileAction] = useActionState(addLibraryFile, {});

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {MODES.map((id) => (
          <Button
            key={id}
            size="sm"
            variant={mode === id ? "primary" : "secondary"}
            type="button"
            onClick={() => setMode(id)}
          >
            {MODE_LABEL[id]}
          </Button>
        ))}
      </div>

      {mode === "link" ? (
        <form action={linkAction} className="space-y-2">
          <FormError error={linkState.error} />
          <input name="name" className={inputClass} placeholder="Title" />
          <input name="url" required className={inputClass} placeholder="https://" />
          <VisibilitySelect />
          <SubmitButton size="sm" pendingLabel="Adding…">
            Add link
          </SubmitButton>
        </form>
      ) : (
        <form action={fileAction} className="space-y-2">
          <input type="hidden" name="kind" value={mode === "image" ? "IMAGE" : "FILE"} />
          <FormError error={fileState.error} />
          <input name="name" className={inputClass} placeholder="Title (optional)" />
          <input
            name="file"
            type="file"
            required
            accept={mode === "image" ? "image/*" : undefined}
            className="w-full text-[13px] text-ink-2 file:mr-3 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-brand-ink hover:file:opacity-90"
          />
          <VisibilitySelect />
          <SubmitButton size="sm" pendingLabel="Uploading…">
            {mode === "image" ? "Add image" : "Add file"}
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
