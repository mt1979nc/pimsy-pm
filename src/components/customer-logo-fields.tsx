import { BrandMark, Field, inputClass } from "@/components/ui";

/**
 * Logo URL or file on create/edit. Does not require Dock.
 * Leave both blank to keep the current mark. Remove is explicit.
 */
export function CustomerLogoFields({
  currentSrc = null,
  currentUrl = null,
  allowClear = false,
  idPrefix = "",
}: {
  currentSrc?: string | null;
  currentUrl?: string | null;
  allowClear?: boolean;
  idPrefix?: string;
}) {
  const urlId = `${idPrefix}logoUrl`;
  const fileId = `${idPrefix}logoFile`;
  return (
    <div className="space-y-3">
      {currentSrc ? (
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandMark name="Logo" src={currentSrc} size={40} />
          <p className="min-w-0 text-[12.5px] text-ink-3">Current mark</p>
        </div>
      ) : null}
      <Field
        label="Logo URL"
        htmlFor={urlId}
        hint="https link to a hosted image. Leave blank to keep the current logo."
      >
        <input
          id={urlId}
          name="logoUrl"
          type="url"
          defaultValue={currentUrl ?? ""}
          placeholder="https://"
          className={inputClass}
        />
      </Field>
      <Field
        label="Or upload a logo"
        htmlFor={fileId}
        hint="PNG, JPG, GIF, or WebP. Up to 2 MB. An upload replaces the URL."
      >
        <input
          id={fileId}
          name="logoFile"
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,.png,.jpg,.jpeg,.gif,.webp"
          className="w-full text-[13px] text-ink-2 file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-ink"
        />
      </Field>
      {allowClear && currentSrc ? (
        <label className="flex items-start gap-2 text-[13px] text-ink-2">
          <input type="checkbox" name="clearLogo" className="mt-0.5" />
          <span>Remove logo</span>
        </label>
      ) : null}
    </div>
  );
}
