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
      <input name="name" defaultValue={name} required className={inputClass} placeholder="Label" />
      <input
        name="url"
        defaultValue={url}
        required
        className={inputClass}
        placeholder="https://…"
      />
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

export function AddLibraryItemForms() {
  const [mode, setMode] = useState<"link" | "file">("link");
  const [linkState, linkAction] = useActionState(addLibraryLink, {});
  const [fileState, fileAction] = useActionState(addLibraryFile, {});

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={mode === "link" ? "primary" : "secondary"}
          type="button"
          onClick={() => setMode("link")}
        >
          Add Link/Form
        </Button>
        <Button
          size="sm"
          variant={mode === "file" ? "primary" : "secondary"}
          type="button"
          onClick={() => setMode("file")}
        >
          Add file
        </Button>
      </div>

      {mode === "link" ? (
        <form action={linkAction} className="space-y-2">
          <FormError error={linkState.error} />
          <input name="name" required className={inputClass} placeholder="Name (e.g. Billing questionnaire)" />
          <input
            name="url"
            required
            className={inputClass}
            placeholder="https:// — paste the real Dock / wizard / questionnaire URL"
          />
          <input
            name="description"
            className={inputClass}
            placeholder="What this opens (optional)"
          />
          <select name="visibility" defaultValue="SHARED" className={inputClass}>
            <option value="SHARED">Shared with customer</option>
            <option value="INTERNAL">Team only</option>
          </select>
          <p className="text-[12px] text-ink-3">
            Paste the live form address. PATH does not invent Storylane or Dock URLs.
          </p>
          <SubmitButton size="sm" pendingLabel="Adding…">
            Add Link/Form
          </SubmitButton>
        </form>
      ) : (
        <form action={fileAction} className="space-y-2">
          <FormError error={fileState.error} />
          <input name="name" className={inputClass} placeholder="Name (optional — defaults to the file name)" />
          <input
            name="file"
            type="file"
            required
            className="w-full text-[13px] text-ink-2 file:mr-3 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-brand-ink hover:file:opacity-90"
          />
          <input
            name="description"
            className={inputClass}
            placeholder="What this file is (optional)"
          />
          <select name="visibility" defaultValue="SHARED" className={inputClass}>
            <option value="SHARED">Shared with customer</option>
            <option value="INTERNAL">Team only</option>
          </select>
          <p className="text-[12px] text-ink-3">
            Images, PDFs, Office documents, CSVs and zips. Up to 25 MB.{" "}
            <strong className="font-medium text-amber">No patient information.</strong>
          </p>
          <SubmitButton size="sm" pendingLabel="Uploading…">
            Add file
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
