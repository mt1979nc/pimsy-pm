/**
 * Dock surfaces discovery resources as clickable buttons on the task
 * (Discovery Wizard, billing sheets, questionnaires). PATH matches that:
 * playbook defaults render as Open / Download buttons, not description URLs.
 */
import {
  DISCOVERY_WIZARD_URL,
  libraryDefsForTaskTitle,
  normalizeAttachmentUrl,
} from "@/db/dock-default-attachments";

export const DOWNLOAD_COMPLETE_UPLOAD_HINT =
  "Download the file below, complete it, then upload the finished file back on this task.";

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

export function playbookResourceButtonLabel(asset: {
  kind: string;
  name: string;
  url?: string | null;
}): string {
  if (asset.kind === "LINK" && isDiscoveryWizardResource(asset)) return "Open Discovery Wizard";
  if (asset.kind === "LINK") return `Open ${asset.name}`;
  return `Download ${asset.name}`;
}

/**
 * Customer upload-request playbook tasks (billing sheet, questionnaires, org /
 * clinical forms). Review / Guided Discovery titles are specialist-side.
 */
export function isCustomerUploadRequestTitle(title: string): boolean {
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
