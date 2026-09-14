/**
 * Default files Dock attaches to Implementation template tasks
 * (Discovery Wizard, billing sheets, questionnaires).
 *
 * Binaries are not in this repo. Placeholders live under
 * `content/default-attachments/` and are uploaded into app storage on seed.
 * Alexander replaces them from Templates → File library (same Azure Blob /
 * local disk pattern as task attachments). Do not invent Dock credentials.
 */
import { normalizeOverlapTitle } from "@/lib/playbook-meta";

export type DefaultLibraryDef = {
  slug: string;
  name: string;
  fileName: string;
  mimeType: string;
  description: string;
  adminNotes: string;
  visibility: "INTERNAL" | "SHARED";
  /** Exact Dock/PATH task titles this file should auto-attach to. */
  attachToTitles: string[];
};

export const DEFAULT_LIBRARY_ASSETS: DefaultLibraryDef[] = [
  {
    slug: "discovery-wizard",
    name: "Discovery Wizard",
    fileName: "Discovery-Wizard.md",
    mimeType: "text/markdown",
    description: "Guided discovery workbook the practice completes before configuration.",
    adminNotes:
      "Replace this placeholder with the live Dock Discovery Wizard (xlsx/pdf/docx). Drop the file on Templates → File library → Discovery Wizard.",
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
    fileName: "Billing-Spreadsheet-Accepted-Payers-Modifiers.md",
    mimeType: "text/markdown",
    description: "Payer / modifier sheet the practice fills out during Discovery.",
    adminNotes:
      "Replace with the Dock billing spreadsheet (xlsx). Attach stays on “Complete & Upload Billing Spreadsheet — Accepted Payers, Modifiers”.",
    visibility: "SHARED",
    attachToTitles: ["Complete & Upload Billing Spreadsheet — Accepted Payers, Modifiers"],
  },
  {
    slug: "billing-questionnaire",
    name: "Billing questionnaire",
    fileName: "Billing-Questionnaire.md",
    mimeType: "text/markdown",
    description: "Billing questionnaire the practice completes in Discovery.",
    adminNotes: "Replace with the Dock billing questionnaire (xlsx/pdf/docx).",
    visibility: "SHARED",
    attachToTitles: ["Billing Questionnaire", "Review Billing Questionnaire Data Sheet"],
  },
  {
    slug: "clinical-workflows-sheet",
    name: "Clinical workflows data sheet",
    fileName: "Clinical-Workflows-Data-Sheet.md",
    mimeType: "text/markdown",
    description: "Clinical workflow capture sheet used in Discovery / configuration.",
    adminNotes: "Replace with the Dock clinical workflows sheet.",
    visibility: "SHARED",
    attachToTitles: ["Clinical Workflows", "Review Clinical Workflow Data Sheet"],
  },
  {
    slug: "organization-details-form",
    name: "Organization details form",
    fileName: "Organization-Details-Form.md",
    mimeType: "text/markdown",
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
