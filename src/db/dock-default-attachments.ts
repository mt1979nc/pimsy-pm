/**
 * Default files / links Dock attaches to Implementation template tasks
 * (Discovery Wizard, billing sheets, questionnaires).
 *
 * Discovery Wizard is the live Azure Static Web Apps URL from the 2026-09-14
 * Dock inventory. Billing questionnaire binaries are not in this repo —
 * placeholders live under `content/default-attachments/` and are uploaded
 * into app storage on seed. Alexander replaces them from Templates → File
 * library. Do not invent Dock credentials.
 */
import { normalizeOverlapTitle } from "@/lib/playbook-meta";

export const DISCOVERY_WIZARD_URL = "https://calm-mud-0fe119810.7.azurestaticapps.net/";

export type DefaultLibraryDef = {
  slug: string;
  name: string;
  kind?: "FILE" | "LINK";
  url?: string;
  fileName?: string;
  mimeType?: string;
  description: string;
  adminNotes: string;
  visibility: "INTERNAL" | "SHARED";
  isPlaceholder?: boolean;
  /** Exact Dock/PATH task titles this file should auto-attach to. */
  attachToTitles: string[];
};

export const DEFAULT_LIBRARY_ASSETS: DefaultLibraryDef[] = [
  {
    slug: "discovery-wizard",
    name: "Discovery Wizard",
    kind: "LINK",
    url: DISCOVERY_WIZARD_URL,
    isPlaceholder: false,
    description:
      "Guided discovery workbook (live PATH/Dock Discovery Wizard). Open the link during Guided Discovery / Workflow Guided Discovery.",
    adminNotes:
      "Live URL from Dock (2026-09-14). Attaches as a LINK on Discovery tasks. Replace the URL here only if the Azure Static Web App moves.",
    visibility: "SHARED",
    attachToTitles: [
      "Guided Discovery Meeting",
      "Organization Details Form",
      "Clinical Workflows",
      "Schedule: Workflow Guided Discovery",
    ],
  },
  {
    slug: "billing-spreadsheet",
    name: "Billing spreadsheet — accepted payers & modifiers",
    kind: "FILE",
    fileName: "Billing-Spreadsheet-Accepted-Payers-Modifiers.md",
    mimeType: "text/markdown",
    isPlaceholder: true,
    description: "Payer / modifier sheet the practice fills out during Discovery.",
    adminNotes:
      "Replace with the Dock billing spreadsheet (xlsx). Attach stays on “Complete & Upload Billing Spreadsheet — Accepted Payers, Modifiers”.",
    visibility: "SHARED",
    attachToTitles: ["Complete & Upload Billing Spreadsheet — Accepted Payers, Modifiers"],
  },
  {
    slug: "billing-questionnaire",
    name: "Billing questionnaire",
    kind: "FILE",
    fileName: "Billing-Questionnaire.md",
    mimeType: "text/markdown",
    isPlaceholder: true,
    description:
      "Submit the billing questionnaire, then upload the completed files on the Discovery task. Site Configuration reviews the data sheet.",
    adminNotes:
      "Replace with the Dock billing questionnaire (xlsx/pdf/docx). Practice submits the questionnaire and uploads files on Billing Questionnaire; specialists review on Review Billing Questionnaire Data Sheet (Site Configuration).",
    visibility: "SHARED",
    attachToTitles: ["Billing Questionnaire", "Review Billing Questionnaire Data Sheet"],
  },
  {
    slug: "clinical-workflows-sheet",
    name: "Clinical workflows data sheet",
    kind: "FILE",
    fileName: "Clinical-Workflows-Data-Sheet.md",
    mimeType: "text/markdown",
    isPlaceholder: true,
    description: "Clinical workflow capture sheet used in Discovery / configuration.",
    adminNotes: "Replace with the Dock clinical workflows sheet.",
    visibility: "SHARED",
    attachToTitles: ["Clinical Workflows", "Review Clinical Workflow Data Sheet"],
  },
  {
    slug: "organization-details-form",
    name: "Organization details form",
    kind: "FILE",
    fileName: "Organization-Details-Form.md",
    mimeType: "text/markdown",
    isPlaceholder: true,
    description: "Org / division / hours capture form.",
    adminNotes: "Replace with the Dock organization details form if it is a separate file.",
    visibility: "SHARED",
    attachToTitles: ["Organization Details Form"],
  },
];

export function librarySlugsForTaskTitle(title: string): string[] {
  const key = normalizeOverlapTitle(title);
  return DEFAULT_LIBRARY_ASSETS.filter((a) =>
    a.attachToTitles.some((t) => normalizeOverlapTitle(t) === key),
  ).map((a) => a.slug);
}
