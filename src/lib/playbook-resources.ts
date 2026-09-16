/**
 * Dock task action buttons (checklist CTAs), resolved for a live PATH task.
 *
 * Buttons come from the in-repo Dock catalog by **title**, so existing WIP
 * shows the PWMI blue CTA even before a resync clones library attachments.
 * Form hrefs use a staff-pasted library LINK when present, else a cloned
 * playbook FILE that actually has a blob. Missing storage is never a download
 * CTA (no 404). Discovery Wizard URL is the known calm-mud SWA stamped with
 * PATH project/task/`/go` return context — never a guessed Storylane address.
 */
import {
  DISCOVERY_WIZARD_URL,
  libraryDefsForTaskTitle,
  normalizeAttachmentUrl,
} from "@/db/dock-default-attachments";
import { assetHasDownloadableBlob } from "@/lib/library-meta";
import { isDiscoveryWizardUrl, wizardLaunchFromTaskHref } from "@/lib/path-deep-links";
import {
  DOCK_BILLING_QUESTIONNAIRE_LABEL,
  DOCK_CLINICAL_FORM_LABEL,
  DOCK_OPEN_FORM_LABEL,
  DOCK_TASK_ACTION_LABEL,
  DOCK_UPLOAD_FILES_LABEL,
  DOCK_ZENDESK_OPEN_LABEL,
  DOCK_DESKTOP_INSTALL_LABEL,
  DOCK_BOOKMARK_LABEL,
  dockTaskActionsForTitle,
  isDockFileRequestTitle,
  type DockTaskActionKind,
} from "@/db/dock-task-buttons";
import { isZendeskAgentUrl } from "@/lib/zendesk";
import { PIMSY_DESKTOP_INSTALL_URL } from "@/lib/accessing-pimsy";

export const DOWNLOAD_COMPLETE_UPLOAD_HINT =
  "Download the file, complete it, then use Upload files on this task to send it back.";

export {
  DOCK_BILLING_QUESTIONNAIRE_LABEL,
  DOCK_CLINICAL_FORM_LABEL,
  DOCK_OPEN_FORM_LABEL,
  DOCK_TASK_ACTION_LABEL,
  DOCK_UPLOAD_FILES_LABEL,
  DOCK_ZENDESK_OPEN_LABEL,
  DOCK_DESKTOP_INSTALL_LABEL,
  DOCK_BOOKMARK_LABEL,
};
export type { DockTaskActionKind };

export function isDiscoveryWizardResource(asset: {
  kind?: string | null;
  name?: string | null;
  url?: string | null;
}): boolean {
  if (asset.url && isDiscoveryWizardUrl(asset.url)) return true;
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

/** Fallback chip label in the template editor. Live tasks use the title catalog. */
export function playbookResourceButtonLabel(asset?: {
  kind?: string;
  name?: string;
  url?: string | null;
}): string {
  if (asset && isDiscoveryWizardResource(asset)) return DOCK_TASK_ACTION_LABEL;
  const name = asset?.name ?? "";
  if (/clinical workflow/i.test(name)) return DOCK_CLINICAL_FORM_LABEL;
  if (/billing questionnaire/i.test(name)) return DOCK_BILLING_QUESTIONNAIRE_LABEL;
  if (/documentation/i.test(name) && /form/i.test(name)) return DOCK_OPEN_FORM_LABEL;
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
  storageKey?: string | null;
  hasBlob?: boolean;
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
  const downloadable = assets.filter((a) => a.kind !== "LINK" && assetHasDownloadableBlob(a));
  return downloadable.find((a) => a.libraryAssetId) ?? downloadable[0];
}

/** Staff-pasted online form (not the Discovery Wizard, not a file download). */
function matchingFormLink(assets: TaskActionAsset[] | undefined): TaskActionAsset | undefined {
  if (!assets?.length) return undefined;
  return assets.find(
    (a) =>
      a.kind === "LINK" &&
      Boolean(a.url?.trim()) &&
      isHttpUrl(a.url!.trim()) &&
      !isDiscoveryWizardResource(a),
  );
}

function wizardHref(assets: TaskActionAsset[] | undefined): string {
  const link = assets?.find((a) => a.kind === "LINK" && isDiscoveryWizardResource(a));
  return (link?.url && link.url.trim()) || DISCOVERY_WIZARD_URL;
}

function isHttpUrl(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

function matchingNamedLink(
  assets: TaskActionAsset[] | undefined,
  matcher: (asset: TaskActionAsset) => boolean,
): TaskActionAsset | undefined {
  if (!assets?.length) return undefined;
  return assets.find(
    (a) => a.kind === "LINK" && Boolean(a.url?.trim()) && isHttpUrl(a.url!.trim()) && matcher(a),
  );
}

function resolveLinkHref(
  action: { id: string; url?: string },
  assets: TaskActionAsset[] | undefined,
): string | null {
  if (action.id.startsWith("zendesk-")) {
    const attached = matchingNamedLink(
      assets,
      (a) => isZendeskAgentUrl(a.url) || /zendesk/i.test(a.name),
    );
    return (attached?.url?.trim() || action.url || null);
  }
  if (action.id === "pimsy-desktop-install") {
    const attached = matchingNamedLink(
      assets,
      (a) =>
        Boolean(a.url && normalizeAttachmentUrl(a.url) === normalizeAttachmentUrl(PIMSY_DESKTOP_INSTALL_URL)) ||
        /desktop/i.test(a.name),
    );
    return attached?.url?.trim() || action.url || PIMSY_DESKTOP_INSTALL_URL;
  }
  if (action.id === "pimsy-bookmark") {
    const attached = matchingNamedLink(
      assets,
      (a) => /bookmark|crm link|crmlink/i.test(a.name) && !isZendeskAgentUrl(a.url),
    );
    return attached?.url?.trim() || null;
  }
  return action.url || wizardHref(assets);
}

/**
 * Resolve Dock-style task action buttons. Title catalog is the source of
 * truth (PWMI labels). Assets fill form/download file URLs when a FILE blob or
 * Link/Form is actually attached — never a 404 download, and never the
 * Discovery Wizard for Clinical / Billing form CTAs.
 */
export function resolveTaskActionButtons(opts: {
  title: string;
  assets?: TaskActionAsset[];
  taskHref?: string | null;
  projectCode?: string | null;
  appOrigin?: string | null;
}): ResolvedTaskActionButton[] {
  const actions = dockTaskActionsForTitle(opts.title);
  const taskHref = opts.taskHref ?? "";
  const out: ResolvedTaskActionButton[] = [];

  for (const action of actions) {
    if (action.kind === "link") {
      const raw = resolveLinkHref(action, opts.assets);
      if (!raw) continue;
      const href = wizardLaunchFromTaskHref(raw, {
        title: opts.title,
        taskHref: opts.taskHref,
        projectCode: opts.projectCode,
        appOrigin: opts.appOrigin,
      });
      out.push({
        id: action.id,
        kind: "link",
        label: action.label,
        resourceName: action.resourceName,
        href,
        popup: isHttpUrl(href),
      });
      continue;
    }
    if (action.kind === "form") {
      if (action.url && isHttpUrl(action.url)) {
        out.push({
          id: action.id,
          kind: "form",
          label: action.label,
          resourceName: action.resourceName,
          href: action.url,
          popup: true,
        });
        continue;
      }
      const formLink = matchingFormLink(opts.assets);
      if (formLink?.url) {
        out.push({
          id: action.id,
          kind: "form",
          label: action.label,
          resourceName: formLink.name || action.resourceName,
          href: formLink.url,
          popup: true,
        });
        continue;
      }
      const asset = matchingDownloadAsset(opts.assets);
      // No LINK and no stored FILE blob — do not present a 404 download.
      if (!asset) continue;
      out.push({
        id: action.id,
        kind: "form",
        label: action.label,
        resourceName: action.resourceName,
        href: fileHref(asset.id),
        popup: false,
      });
      continue;
    }
    if (action.kind === "download") {
      const asset = matchingDownloadAsset(opts.assets);
      if (!asset) continue;
      out.push({
        id: action.id,
        kind: "download",
        label: action.label,
        resourceName: action.resourceName,
        href: fileHref(asset.id),
        popup: false,
      });
      continue;
    }
    out.push({
      id: action.id,
      kind: "upload",
      label: action.label || DOCK_UPLOAD_FILES_LABEL,
      resourceName: action.resourceName,
      href: taskHref ? `${taskHref}#upload` : "#upload",
      popup: false,
    });
  }

  return out;
}
