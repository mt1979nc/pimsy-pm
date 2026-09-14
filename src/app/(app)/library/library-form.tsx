"use client";

import { useActionState } from "react";
import { uploadLibraryFile } from "@/actions/library";
import { SubmitButton, FormError } from "@/components/submit-button";

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
