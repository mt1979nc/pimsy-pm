/**
 * Dock task action buttons (checklist CTAs), resolved for a live PATH task.
 *
 * Buttons come from the in-repo Dock catalog by **title**, so existing WIP
 * shows a blue Click here even before a resync clones library attachments.
 * Download hrefs use a cloned file when present; otherwise they land on the
 * task’s Links & files. The Discovery Wizard URL is the known calm-mud SWA —
 * never a guessed Storylane address.
 */
import {
  DISCOVERY_WIZARD_URL,
  libraryDefsForTaskTitle,
  normalizeAttachmentUrl,
} from "@/db/dock-default-attachments";
import {
  DOCK_TASK_ACTION_LABEL,
  dockTaskActionsForTitle,
  isDockFileRequestTitle,
  type DockTaskActionKind,
} from "@/db/dock-task-buttons";

export const DOWNLOAD_COMPLETE_UPLOAD_HINT =
  "Click here to download the file, complete it, then upload the finished file back on this task.";

export { DOCK_TASK_ACTION_LABEL };
export type { DockTaskActionKind };

export function isDiscoveryWizardResource(asset: {
  kind?: string | null;
  name?: string | null;
  url?: string | null;
}): boolean {
  if (asset.url) {
    try {
      if (normalizeAttachmentUrl(asset.url) === normalizeAttachmentUrl(DISCOVERY_WIZARD_URL)) {
        return true;
      }
    } catch {
      /* ignore */
    }
  }
  return /discovery wizard/i.test(asset.name ?? "");
}

/** Playbook-default discovery resource (library clone or the live Wizard URL). */
export function isPlaybookResourceAsset(asset: {
  libraryAssetId?: string | null;
  kind?: string | null;
  name?: string | null;
  url?: string | null;
}): boolean {
  if (asset.libraryAssetId) return true;
  return isDiscoveryWizardResource(asset);
}

/** Dock checklist CTA copy. Always “Click here” for playbook actions. */
export function playbookResourceButtonLabel(_asset?: {
  kind?: string;
  name?: string;
  url?: string | null;
}): string {
  return DOCK_TASK_ACTION_LABEL;
}

/**
 * Customer upload-request playbook tasks (billing sheet, questionnaires, org /
 * clinical forms, Dock file-request titles). Review / Guided Discovery stay
 * specialist-side.
 */
export function isCustomerUploadRequestTitle(title: string): boolean {
  if (isDockFileRequestTitle(title)) return true;
  const defs = libraryDefsForTaskTitle(title);
  const hasFile = defs.some((d) => (d.kind ?? "FILE") !== "LINK");
  if (!hasFile) return false;
  const trimmed = title.trim();
  if (/^review\b/i.test(trimmed)) return false;
  if (/guided discovery/i.test(trimmed)) return false;
  return true;
}

export function hasPlaybookFileResource(
  assets: Array<{ libraryAssetId?: string | null; kind: string }>,
): boolean {
  return assets.some((a) => a.libraryAssetId && a.kind !== "LINK");
}

export type TaskActionAsset = {
  id: string;
  kind: string;
  name: string;
  url?: string | null;
  libraryAssetId?: string | null;
};

export type ResolvedTaskActionButton = {
  id: string;
  kind: DockTaskActionKind;
  label: string;
  resourceName: string;
  href: string;
  /** Dock opens link/form actions in a popup; PATH uses a modal + new-tab fallback. */
  popup: boolean;
};

function fileHref(assetId: string): string {
  return `/api/files/${assetId}`;
}

function matchingDownloadAsset(assets: TaskActionAsset[] | undefined): TaskActionAsset | undefined {
  if (!assets?.length) return undefined;
  return (
    assets.find((a) => a.kind !== "LINK" && a.libraryAssetId) ??
    assets.find((a) => a.kind !== "LINK")
  );
}

function wizardHref(assets: TaskActionAsset[] | undefined): string {
  const link = assets?.find((a) => a.kind === "LINK" && isDiscoveryWizardResource(a));
  return (link?.url && link.url.trim()) || DISCOVERY_WIZARD_URL;
}

/**
 * Resolve Dock-style Click here buttons for this task. Title catalog is the
 * source of truth; assets only fill download URLs.
 */
export function resolveTaskActionButtons(opts: {
  title: string;
  assets?: TaskActionAsset[];
  taskHref?: string | null;
}): ResolvedTaskActionButton[] {
  const actions = dockTaskActionsForTitle(opts.title);
  const taskHref = opts.taskHref ?? "";
  const out: ResolvedTaskActionButton[] = [];

  for (const action of actions) {
    if (action.kind === "link") {
      out.push({
        id: action.id,
        kind: "link",
        label: action.label,
        resourceName: action.resourceName,
        href: action.url || wizardHref(opts.assets),
        popup: true,
      });
      continue;
    }
    if (action.kind === "download") {
      const asset = matchingDownloadAsset(opts.assets);
      out.push({
        id: action.id,
        kind: "download",
        label: action.label,
        resourceName: action.resourceName,
        href: asset ? fileHref(asset.id) : taskHref ? `${taskHref}#files` : "#files",
        popup: false,
      });
      continue;
    }
    out.push({
      id: action.id,
      kind: "upload",
      label: action.label,
      resourceName: action.resourceName,
      href: taskHref ? `${taskHref}#upload` : "#upload",
      popup: false,
    });
  }

  return out;
}
