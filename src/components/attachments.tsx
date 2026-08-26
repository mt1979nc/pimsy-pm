"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  addTaskLink,
  uploadTaskFile,
  deleteAttachment,
  setAttachmentVisibility,
} from "@/actions/attachments";
import { SubmitButton, FormError } from "@/components/submit-button";
import { Button, inputClass, VisibilityBadge } from "@/components/ui";
import { fmtRelative } from "@/lib/dates";
import { cn } from "@/lib/cn";

type Asset = {
  id: string;
  name: string;
  kind: "FILE" | "IMAGE" | "LINK";
  url: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  description: string | null;
  visibility: "INTERNAL" | "SHARED";
  createdAt: Date | string;
  uploadedById: string | null;
  uploadedBy?: { id: string; name: string | null; image?: string | null } | null;
};

function href(a: Asset) {
  return a.kind === "LINK" ? (a.url ?? "#") : `/api/files/${a.id}`;
}

function prettySize(bytes: number | null) {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function KindIcon({ kind }: { kind: Asset["kind"] }) {
  const common = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8 } as const;
  if (kind === "LINK")
    return (
      <svg {...common} aria-hidden>
        <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
        <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
      </svg>
    );
  if (kind === "IMAGE")
    return (
      <svg {...common} aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="9" cy="9" r="1.6" />
        <path d="m21 15-5-5L5 21" />
      </svg>
    );
  return (
    <svg {...common} aria-hidden>
      <path d="M14 3v5h5" />
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    </svg>
  );
}

export function AttachmentList({
  assets,
  currentUserId,
  canManageVisibility,
  canDelete = true,
}: {
  assets: Asset[];
  currentUserId: string;
  canManageVisibility: boolean;
  canDelete?: boolean;
}) {
  if (assets.length === 0) {
    return (
      <p className="px-5 py-4 text-[13px] text-ink-3">
        Nothing attached yet. Add a link or a file below.
      </p>
    );
  }

  const images = assets.filter((a) => a.kind === "IMAGE");
  const rest = assets.filter((a) => a.kind !== "IMAGE");

  return (
    <div>
      {images.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3">
          {images.map((a) => (
            <figure key={a.id} className="group relative overflow-hidden rounded-lg border border-border">
              <a href={href(a)} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={href(a)}
                  alt={a.description || a.name}
                  className="aspect-[4/3] w-full bg-surface-2 object-cover transition-opacity group-hover:opacity-90"
                  loading="lazy"
                />
              </a>
              <figcaption className="flex items-center justify-between gap-2 border-t border-border px-2 py-1.5">
                <span className="truncate text-[11.5px] text-ink-2" title={a.name}>
                  {a.name}
                </span>
                <AssetControls
                  asset={a}
                  currentUserId={currentUserId}
                  canManageVisibility={canManageVisibility}
                  canDelete={canDelete}
                  compact
                />
              </figcaption>
            </figure>
          ))}
        </div>
      ) : null}

      {rest.length > 0 ? (
        <div className="divide-y divide-border">
          {rest.map((a) => (
            <div key={a.id} className="flex items-start gap-3 px-4 py-2.5">
              <span className="mt-0.5 shrink-0 text-ink-3">
                <KindIcon kind={a.kind} />
              </span>
              <div className="min-w-0 flex-1">
                <a
                  href={href(a)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-[13.5px] font-medium text-ink hover:text-brand hover:underline"
                >
                  {a.name}
                </a>
                {a.description ? (
                  <p className="mt-0.5 text-[12.5px] leading-snug text-ink-2">{a.description}</p>
                ) : null}
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-ink-3">
                  {a.uploadedBy ? <span>{a.uploadedBy.name}</span> : null}
                  <span>{fmtRelative(a.createdAt)}</span>
                  {prettySize(a.sizeBytes) ? <span>{prettySize(a.sizeBytes)}</span> : null}
                  {a.kind === "LINK" && a.url ? (
                    <span className="truncate">{safeHost(a.url)}</span>
                  ) : null}
                </div>
              </div>
              <AssetControls
                asset={a}
                currentUserId={currentUserId}
                canManageVisibility={canManageVisibility}
                canDelete={canDelete}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function safeHost(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function AssetControls({
  asset,
  currentUserId,
  canManageVisibility,
  canDelete,
  compact = false,
}: {
  asset: Asset;
  currentUserId: string;
  canManageVisibility: boolean;
  canDelete: boolean;
  compact?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const mine = asset.uploadedById === currentUserId;

  return (
    <div className={cn("flex shrink-0 items-center gap-1.5", pending && "opacity-50")}>
      {canManageVisibility ? (
        <button
          type="button"
          disabled={pending}
          title="Toggle whether the customer can see this"
          onClick={() => {
            setError(null);
            start(async () => {
              try {
                await setAttachmentVisibility(
                  asset.id,
                  asset.visibility === "SHARED" ? "INTERNAL" : "SHARED",
                );
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not change visibility.");
              }
            });
          }}
        >
          <VisibilityBadge visibility={asset.visibility} />
        </button>
      ) : null}

      {canDelete && (canManageVisibility || mine) ? (
        <button
          type="button"
          disabled={pending}
          aria-label={`Remove ${asset.name}`}
          onClick={() => {
            setError(null);
            start(async () => {
              try {
                await deleteAttachment(asset.id);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not remove that.");
              }
            });
          }}
          className="rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-red"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16M9 6V4h6v2M7 6l1 14h8l1-14" />
          </svg>
        </button>
      ) : null}

      {error && !compact ? <span className="text-[11.5px] text-red">{error}</span> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add link / upload file
// ---------------------------------------------------------------------------

export function AddAttachment({
  taskId,
  canChooseVisibility,
  defaultVisibility,
  taskIsInternal,
}: {
  taskId: string;
  canChooseVisibility: boolean;
  defaultVisibility: "INTERNAL" | "SHARED";
  taskIsInternal: boolean;
}) {
  const [mode, setMode] = useState<"none" | "link" | "file">("none");
  const [visibility, setVisibility] = useState<"INTERNAL" | "SHARED">(defaultVisibility);

  const [linkState, linkAction] = useActionState(addTaskLink, {});
  const [fileState, fileAction] = useActionState(uploadTaskFile, {});
  const linkRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (linkState.ok) {
      linkRef.current?.reset();
      setMode("none");
    }
  }, [linkState.ok]);
  useEffect(() => {
    if (fileState.ok) {
      fileRef.current?.reset();
      setMode("none");
    }
  }, [fileState.ok]);

  const effective = taskIsInternal ? "INTERNAL" : visibility;

  if (mode === "none") {
    return (
      <div className="flex items-center gap-2 border-t border-border px-4 py-2.5">
        <Button size="sm" onClick={() => setMode("link")}>
          Add link
        </Button>
        <Button size="sm" onClick={() => setMode("file")}>
          Upload file
        </Button>
      </div>
    );
  }

  const visibilityControl = canChooseVisibility ? (
    <button
      type="button"
      disabled={taskIsInternal}
      title={
        taskIsInternal
          ? "This task is internal, so anything attached to it is too"
          : "Toggle whether the customer can see this"
      }
      onClick={() => setVisibility(visibility === "SHARED" ? "INTERNAL" : "SHARED")}
      className="disabled:opacity-70"
    >
      <VisibilityBadge visibility={effective} />
    </button>
  ) : (
    <VisibilityBadge visibility={effective} />
  );

  if (mode === "link") {
    return (
      <form ref={linkRef} action={linkAction} className="space-y-2.5 border-t border-border bg-surface-2 p-4">
        <input type="hidden" name="taskId" value={taskId} />
        <input type="hidden" name="visibility" value={effective} />
        <FormError error={linkState.error} />
        <input
          name="url"
          required
          autoFocus
          placeholder="https://drive.google.com/… or a Zendesk ticket"
          className={inputClass}
        />
        <input name="name" placeholder="Label (optional)" className={inputClass} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          {visibilityControl}
          <div className="flex items-center gap-2">
            <Button size="sm" type="button" onClick={() => setMode("none")}>
              Cancel
            </Button>
            <SubmitButton size="sm" pendingLabel="Adding…">
              Add link
            </SubmitButton>
          </div>
        </div>
      </form>
    );
  }

  return (
    <form ref={fileRef} action={fileAction} className="space-y-2.5 border-t border-border bg-surface-2 p-4">
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="visibility" value={effective} />
      <FormError error={fileState.error} />
      <input
        type="file"
        name="file"
        required
        className="w-full text-[13px] text-ink-2 file:mr-3 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-brand-ink hover:file:opacity-90"
      />
      <input name="description" placeholder="Note (optional)" className={inputClass} />
      <p className="text-[12px] text-ink-3">
        Images, PDFs, Office documents, CSVs and zips. Up to 25 MB.{" "}
        <strong className="font-medium text-amber">No patient information.</strong>
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {visibilityControl}
        <div className="flex items-center gap-2">
          <Button size="sm" type="button" onClick={() => setMode("none")}>
            Cancel
          </Button>
          <SubmitButton size="sm" pendingLabel="Uploading…">
            Upload
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}
