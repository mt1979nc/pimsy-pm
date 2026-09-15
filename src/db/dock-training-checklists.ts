/**
 * Dock-style “areas to cover” on training tasks.
 *
 * Dock stores these as description checklists on the training session tasks.
 * PATH promotes them to first-class checklist items (editable, per-item done).
 *
 * Training 1 labels are the THS sample from the 2026-09-14 Dock inventory.
 * The combined Dock title and PATH’s split “Training 1: Intro to PIMSY”
 * share that list. Labels are logistics/curriculum topics only — no PHI.
 */
import { normalizeOverlapTitle } from "@/lib/playbook-meta";

export type DockChecklistSeed = {
  label: string;
  visibility: "INTERNAL" | "SHARED";
};

/** Dock live Training 1 title (THS, 2026-09-14). */
export const DOCK_TRAINING_1_TITLE =
  "Training 1: Intro to PIMSY, Client Charts, Appointments/Calendar";

export const PATH_TRAINING_1_TITLE = "Training 1: Intro to PIMSY";

/** THS areas-to-cover checkboxes (Dock Training 1). */
export const THS_TRAINING_1_AREAS: DockChecklistSeed[] = [
  { label: "User Profile / Signature Capture", visibility: "SHARED" },
  { label: "Provider Dashboard", visibility: "SHARED" },
  { label: "Appointment Widget", visibility: "SHARED" },
  { label: "Client Management (active, inactive, groups, favorites)", visibility: "SHARED" },
  { label: "Client Create / Term", visibility: "SHARED" },
];

/**
 * Storylane walkthroughs live as LINK attachments on the task (same pattern as
 * other training Storylane links). Do not invent a cohort URL in this repo.
 */
export const TRAINING_STORYLANE_DESCRIPTION =
  "Storylane walkthrough: attach this session’s Storylane link as a LINK on the task (Links & files). Use the URL your specialist shares for this cohort — do not guess or paste a placeholder Storylane address.";

export const TRAINING_SESSION_DESCRIPTION =
  "Areas to cover in this session. Check each item off as you train it. Visible to the practice on this shared task.";

export function trainingDescriptionForTitle(title: string): string | null {
  const items = checklistForTaskTitle(title);
  if (items.length === 0) return null;
  const key = normalizeOverlapTitle(title);
  const isTraining1 =
    key === normalizeOverlapTitle(PATH_TRAINING_1_TITLE) ||
    key === normalizeOverlapTitle(DOCK_TRAINING_1_TITLE);
  const head = isTraining1
    ? `${TRAINING_SESSION_DESCRIPTION}\n\n${TRAINING_STORYLANE_DESCRIPTION}`
    : TRAINING_SESSION_DESCRIPTION;
  const lines = items.map((i) => `- [ ] ${i.label}`).join("\n");
  return `${head}\n\n${lines}`;
}

function withTitles(titles: string[], items: DockChecklistSeed[]): Record<string, DockChecklistSeed[]> {
  const out: Record<string, DockChecklistSeed[]> = {};
  for (const title of titles) {
    out[normalizeOverlapTitle(title)] = items;
  }
  return out;
}

/** Keys are normalized titles (see normalizeOverlapTitle). */
export const TRAINING_CHECKLISTS_BY_TITLE: Record<string, DockChecklistSeed[]> = {
  ...withTitles([PATH_TRAINING_1_TITLE, DOCK_TRAINING_1_TITLE], THS_TRAINING_1_AREAS),
  [normalizeOverlapTitle("Training 2: Client Charts")]: [
    { label: "Creating a client", visibility: "SHARED" },
    { label: "Demographics and contacts", visibility: "SHARED" },
    { label: "Diagnoses", visibility: "SHARED" },
    { label: "Treatment planning", visibility: "SHARED" },
    { label: "Chart documents", visibility: "SHARED" },
  ],
  [normalizeOverlapTitle("Training 3: Appointments & Notes")]: [
    { label: "Scheduling appointments", visibility: "SHARED" },
    { label: "Progress notes and note templates", visibility: "SHARED" },
    { label: "Payments at checkout", visibility: "SHARED" },
    { label: "Paisly Ambient Scribe (if in scope)", visibility: "SHARED" },
  ],
  [normalizeOverlapTitle("Training 4: Group Notes (if applicable)")]: [
    { label: "Group session setup", visibility: "SHARED" },
    { label: "Group note documentation", visibility: "SHARED" },
    { label: "Attendance and individual follow-up notes", visibility: "SHARED" },
  ],
  [normalizeOverlapTitle("Training 5: Intake")]: [
    { label: "Intake Assistant / public forms", visibility: "SHARED" },
    { label: "New-client workflow from inquiry to chart", visibility: "SHARED" },
    { label: "Consents and required intake documents", visibility: "SHARED" },
  ],
  [normalizeOverlapTitle("Training: Complex Clinical (ePrescribe)")]: [
    { label: "Prescriber workspace and queues", visibility: "SHARED" },
    { label: "Sending a prescription", visibility: "SHARED" },
    { label: "EPCS / ID proofing status", visibility: "SHARED" },
    { label: "PDMP (if in scope)", visibility: "SHARED" },
  ],
  [normalizeOverlapTitle("Billing Training 1: Codes & Rates")]: [
    { label: "Codes, rates, and fee schedules", visibility: "SHARED" },
    { label: "Payer setup overview", visibility: "SHARED" },
  ],
  [normalizeOverlapTitle("Billing Training 2: Authorizations")]: [
    { label: "Authorization entry and tracking", visibility: "SHARED" },
    { label: "Units, dates, and alerts", visibility: "SHARED" },
  ],
  [normalizeOverlapTitle("Billing Training 3: Intro to Invoicing")]: [
    { label: "Claim / invoice generation", visibility: "SHARED" },
    { label: "Scrubbing and submission path", visibility: "SHARED" },
  ],
  [normalizeOverlapTitle("Payroll Training 1 (1 week before go-live)")]: [
    { label: "Payroll setup for go-live week", visibility: "SHARED" },
    { label: "Who runs payroll vs. who reviews", visibility: "SHARED" },
  ],
  [normalizeOverlapTitle("Billing Training 4 (Post Go-Live): Tier 2")]: [
    { label: "Denial follow-up basics", visibility: "SHARED" },
    { label: "Batch review after first claims", visibility: "SHARED" },
  ],
  [normalizeOverlapTitle("Billing Training 5 (Post Go-Live): Tier 2")]: [
    { label: "Reporting and month-end billing", visibility: "SHARED" },
  ],
  [normalizeOverlapTitle("Payroll Training 2: Tier 2")]: [
    { label: "Payroll adjustments after go-live", visibility: "SHARED" },
  ],
  [normalizeOverlapTitle("Client Payment Training: Tier 2")]: [
    { label: "Patient payments and receipts", visibility: "SHARED" },
    { label: "Credit card / portal payments (if in scope)", visibility: "SHARED" },
  ],
};

export function checklistForTaskTitle(title: string): DockChecklistSeed[] {
  return TRAINING_CHECKLISTS_BY_TITLE[normalizeOverlapTitle(title)] ?? [];
}

/**
 * Parse Dock-style markdown checklists from a scraped task description.
 * Accepts `- [ ]`, `- [x]`, `* [ ]`, and numbered `[ ]` lines.
 */
export function parseChecklistFromDescription(description: string | null | undefined): {
  label: string;
  done: boolean;
}[] {
  if (!description) return [];
  const items: { label: string; done: boolean }[] = [];
  for (const raw of description.split(/\r?\n/)) {
    const line = raw.trim();
    const m = line.match(/^(?:[-*]|\d+[.)])\s*\[(x|X| )\]\s+(.+)$/);
    if (!m) continue;
    const label = m[2]!.replace(/\s+/g, " ").trim();
    if (!label) continue;
    items.push({ label, done: m[1] !== " " });
  }
  return items;
}
