/**
 * Customer Learning Center information architecture.
 *
 * Dock’s Implementation Template Learning Center is a long flat page (Intro,
 * Training Guide, Getting Started, Overview, Password Reset, then unlabeled
 * Scheduling / Notes / Providers PDFs and Storylane embeds). PATH carries the
 * same customer-facing topics as a numbered journey:
 *
 *   1. Getting started → 2. Discovery → 3. Training modules → 4. Billing
 *   → 5. Go-live → 6. After go-live → 7. Reference
 *
 * Cards have real titles (never “View PDF”). Live URLs are only those already
 * in this repo (Discovery Wizard, PIMSY desktop installer). Storylane / PDF
 * binaries without a known URL stay clearly marked placeholders. No PHI.
 *
 * Re-seed with `npm run db:seed -- --templates-only`. No schema migrate.
 */

export type LearningTopic =
  | "getting_started"
  | "discovery"
  | "training"
  | "billing"
  | "go_live"
  | "after_go_live"
  | "reference";

export type LearningAudience = "all" | "clinical" | "billing" | "admin";

export const LEARNING_JOURNEY_SECTION_SLUGS = [
  "getting-started",
  "discovery",
  "training",
  "billing",
  "go-live",
  "after-go-live",
  "reference",
] as const;

export const LEARNING_TOPIC_META: Record<
  LearningTopic,
  { label: string; blurb: string }
> = {
  getting_started: {
    label: "Getting started",
    blurb: "Welcome, access, password reset, Training Guide, overview.",
  },
  discovery: {
    label: "Discovery",
    blurb: "What we need from you before configuration starts.",
  },
  training: {
    label: "Training modules",
    blurb: "How training works, then Training 1–5 in order.",
  },
  billing: {
    label: "Billing",
    blurb: "Questionnaire, payers & modifiers, ClaimMD, taking a payment.",
  },
  go_live: {
    label: "Go-live",
    blurb: "The readiness gate — no patient data here.",
  },
  after_go_live: {
    label: "After go-live",
    blurb: "Tier 2 training, survey, and support handoff.",
  },
  reference: {
    label: "Reference",
    blurb: "Named Scheduling, Notes, and Providers how-tos — not unlabeled PDFs.",
  },
};

export const LEARNING_AUDIENCE_LABEL: Record<LearningAudience, string> = {
  all: "Everyone",
  clinical: "Clinical",
  billing: "Billing",
  admin: "Admin / leadership",
};

export function learningKindLabel(kind: string): string {
  const k = kind.toUpperCase();
  if (k === "LINK") return "Link";
  if (k === "FILE") return "File";
  return "Article";
}

/** 1-based journey step from section.order (0, 10, 20, …). */
export function learningJourneyStep(order: number): number {
  return Math.floor(order / 10) + 1;
}

/** Catalog / detail badge when a Dock PDF or Storylane URL is not in this repo yet. */
export function learningPlaceholderLabel(kind: string): string {
  const k = kind.toUpperCase();
  if (k === "FILE") return "File pending";
  if (k === "LINK") return "Walkthrough pending";
  return "Walkthrough pending";
}

/** Named open/download control — never “View PDF”. */
export function learningOpenLabel(title: string, kind = "LINK"): string {
  if (title.toLowerCase().includes("wizard")) return "Open Discovery Wizard";
  if (kind.toUpperCase() === "FILE") return `Download ${title}`;
  return `Open ${title}`;
}

export type LearningItemSeed = {
  slugKey: string;
  title: string;
  summary: string;
  body: string;
  kind: "ARTICLE" | "LINK" | "FILE";
  audienceRole: LearningAudience;
  order: number;
  librarySlug?: string;
  url?: string;
  isPlaceholder?: boolean;
  /** Prior seed titles to update in place instead of duplicating. */
  replaceTitles?: string[];
};

export type LearningSectionSeed = {
  slug: string;
  title: string;
  description: string;
  topic: LearningTopic;
  audienceRole: LearningAudience;
  order: number;
  items: LearningItemSeed[];
};

/** Live Discovery Wizard — same URL Dock attaches (not a blank embed). */
export const DISCOVERY_WIZARD_LEARNING_URL =
  "https://calm-mud-0fe119810.7.azurestaticapps.net/";

/** Documented Help Desk installer page — same URL Accessing Pimsy attaches. */
export const LEARNING_DESKTOP_INSTALL_URL = "https://pimsyehr.com/solutions/install-pimsy/";

const STORYLANE_PLACEHOLDER_NOTE =
  "Interactive Storylane walkthrough: your specialist pastes this cohort’s URL on the matching training task (Links & files), and can paste it on this card when it is known. PATH does not invent a Storylane address. Until then this card stays a named placeholder — not an unlabeled “View PDF” or a blank embed.";

function walkthrough(input: {
  slugKey: string;
  title: string;
  group: "Scheduling" | "Notes" | "Providers";
  summary: string;
  steps: string;
  audienceRole: LearningAudience;
  order: number;
}): LearningItemSeed {
  return {
    slugKey: input.slugKey,
    title: input.title,
    summary: input.summary,
    body: `${input.group} how-to (Dock Learning Center listed this under ${input.group}).

${input.steps}

${STORYLANE_PLACEHOLDER_NOTE}

Use test/demo clients in PIMSY — never real patient records in this workspace.`,
    kind: "LINK",
    audienceRole: input.audienceRole,
    order: input.order,
    isPlaceholder: true,
  };
}

export const LEARNING_CENTER_SECTIONS: LearningSectionSeed[] = [
  {
    slug: "getting-started",
    title: "Getting started",
    description:
      "Welcome, how you access PIMSY, password reset, the Training Guide, and a short overview of this workspace.",
    topic: "getting_started",
    audienceRole: "all",
    order: 0,
    items: [
      {
        slugKey: "intro",
        title: "Intro to PIMSY",
        summary: "Welcome — what PIMSY is for, and what this implementation workspace is not.",
        body: `Welcome. PIMSY is your electronic health record. This PATH workspace tracks your implementation: timelines, configuration checklists, training, and messages with your specialist.

This portal is not a second copy of the EHR. Please do not post patient names, charts, or clinical detail here. If you need to send that kind of information, ask your specialist for the secure channel.

Use **Your action items** on the home screen for work waiting on your team. Use **Messages** for questions. Use this Learning Center as the journey map — Getting started, Discovery, Training, Billing, Go-live, After go-live, then Reference — each topic is a card with a real title, not an unlabeled “View PDF”.`,
        kind: "ARTICLE",
        audienceRole: "all",
        order: 0,
        isPlaceholder: false,
        replaceTitles: ["Welcome to your implementation workspace"],
      },
      {
        slugKey: "access",
        title: "Access",
        summary: "Bookmark, desktop app, practice acronym, and security key — how you sign in to PIMSY.",
        body: `Your specialist fills **Accessing Pimsy** on the project when accounts are ready. Typical pieces:

1. Web bookmark for your practice’s PIMSY site (your specialist adds the live URL — PATH does not guess a tenant host).
2. Windows desktop app installer (the public Help Desk page linked on this card).
3. Practice acronym and security key, prompted during desktop setup.

Confirm trainers can sign in before Training 1. PATH (this workspace) is a separate login from PIMSY; use Forgot password on the PATH sign-in page if you cannot open the portal.

Do not send passwords, security keys, or patient data in Messages.`,
        kind: "LINK",
        audienceRole: "all",
        order: 1,
        librarySlug: "pimsy-desktop-install",
        url: LEARNING_DESKTOP_INSTALL_URL,
        isPlaceholder: false,
      },
      {
        slugKey: "password-reset",
        title: "Password reset",
        summary: "Reset a PIMSY or PATH login without waiting on a blank how-to embed.",
        body: `**PATH (this workspace):** use Forgot password on the PATH sign-in page, or ask your specialist to resend an invite. Named staff never reset customer passwords by guessing.

**PIMSY (the EHR):** use Forgot password on the PIMSY sign-in page. If your practice uses SSO, follow your IT process instead.

Dock showed this as a Storylane walkthrough. PATH keeps the steps on this card. If your specialist later pastes the cohort Storylane URL on the training task, open it from Links & files — there is no guessed Storylane address here.

Your specialist can confirm which login you need for training day. Do not send passwords or patient data in Messages.`,
        kind: "ARTICLE",
        audienceRole: "all",
        order: 2,
        isPlaceholder: false,
      },
      {
        slugKey: "training-guide-start",
        title: "Training Guide",
        summary: "How Train-the-Trainer works — the same guide Dock listed at the top of Learning Center.",
        body: `Core (Train the Trainer) is a short series of sessions. Your trainers attend; they train the rest of the practice.

On each training task your specialist checks off **areas to cover** as they go — you can see those checkboxes on the shared task. After the session, the recording link is attached to that same task (and may also appear under Recordings).

Open **Training modules** next in this Learning Center for How training works, then Training 1–5 in order (including Training 4 when your site uses group notes).

Dock shipped this as a PDF. PATH keeps the guide as this titled card. If Alexander later uploads the Dock PDF into the file library, staff can attach it here — until then there is no blank “View PDF” button.

Interactive Storylane walkthroughs, when used, are a **link on the training task** (not an empty embed here). Your specialist pastes the cohort URL.

Optional tracks: Training 4 (group notes), ePrescribe, Inpatient/MAT — only if those are in scope for your site.`,
        kind: "ARTICLE",
        audienceRole: "all",
        order: 3,
        isPlaceholder: false,
      },
      {
        slugKey: "overview",
        title: "Overview",
        summary: "Areas, messages, recordings, and where files live on a task.",
        body: `Each project has **Areas** (phases such as Kickoff, Discovery, Training). Open an area to see the shared tasks. A violet **Yours** badge means your team owns that step.

Shared files and links on a task appear under **Links & files**. Training recordings, when your specialist adds them, show under **Recordings**.

The Learning Center (this page) is the same for every project — it is your practice library, ordered as the customer journey. Search the cards above; we do not dump unlabeled PDFs or empty viewers on one long page.`,
        kind: "ARTICLE",
        audienceRole: "all",
        order: 4,
        isPlaceholder: false,
        replaceTitles: ["Finding your way around"],
      },
      {
        slugKey: "getting-started",
        title: "Getting started",
        summary: "First weeks: sign in, trainers, and where files live.",
        body: `In the first weeks you will:

1. Confirm your PATH portal login (invite email from your specialist) and PIMSY access (see **Access**).
2. Name trainers for Core (Train the Trainer) sessions.
3. Complete Discovery worksheets (Organization Details, Clinical Workflows, Billing Questionnaire).
4. Open the Discovery Wizard from the Discovery card (live link — not a blank embed).

Nothing in this workspace should include client/patient lists. Training uses demo/test clients inside PIMSY, not here.`,
        kind: "ARTICLE",
        audienceRole: "all",
        order: 5,
        isPlaceholder: false,
      },
    ],
  },
  {
    slug: "discovery",
    title: "Discovery",
    description:
      "Customer-facing: what we need from you before configuration — wizard, organization details, and clinical workflows.",
    topic: "discovery",
    audienceRole: "admin",
    order: 10,
    items: [
      {
        slugKey: "discovery-wizard",
        title: "Discovery Wizard",
        summary: "Open the live guided discovery workbook (same link Dock attaches).",
        body: `Your specialist walks this during Guided Discovery / Workflow Guided Discovery. Complete the practice sections in the wizard, then keep working copies on the **Organization Details Form** and **Clinical Workflows** tasks.

This card is a real link — not a blank PDF embed. If the wizard does not load, tell your specialist; do not upload patient lists here.`,
        kind: "LINK",
        audienceRole: "admin",
        order: 0,
        librarySlug: "discovery-wizard",
        url: DISCOVERY_WIZARD_LEARNING_URL,
        isPlaceholder: false,
      },
      {
        slugKey: "org-details",
        title: "Organization details",
        summary: "Legal name, divisions, hours, logos — what we need to build the org.",
        body: `Complete the Organization Details Form on your Discovery task list. Logos and letterhead upload on their own tasks.

Nothing here should include client/patient lists.`,
        kind: "ARTICLE",
        audienceRole: "admin",
        order: 1,
        isPlaceholder: false,
        librarySlug: "organization-details-form",
      },
      {
        slugKey: "clinical-workflows",
        title: "Clinical workflows",
        summary: "How your team documents today — used to configure notes and forms.",
        body: `The Clinical Workflows sheet captures how scheduling, notes, and intake work at your practice. Fill it in on the Discovery task. No patient examples.`,
        kind: "ARTICLE",
        audienceRole: "clinical",
        order: 2,
        isPlaceholder: false,
        librarySlug: "clinical-workflows-sheet",
      },
    ],
  },
  {
    slug: "training",
    title: "Training modules",
    description:
      "Training Guide, how sessions work, then Training 1–5 in order. Recordings and Storylane links attach on the matching task — not as blank embeds here.",
    topic: "training",
    audienceRole: "clinical",
    order: 20,
    items: [
      {
        slugKey: "training-guide",
        title: "Training Guide",
        summary: "How Train-the-Trainer works, what to prepare, and where checklists live.",
        body: `Core (Train the Trainer) is a short series of sessions. Your trainers attend; they train the rest of the practice.

On each training task your specialist checks off **areas to cover** as they go — you can see those checkboxes on the shared task. After the session, the recording link is attached to that same task (and may also appear under Recordings).

Work the modules below in order: How training works, then Training 1, 2, 3, 4 (group notes, if in scope), and 5 (intake). Scheduling, notes, and provider walkthroughs with real titles live under **Reference**.

Interactive Storylane walkthroughs, when used, are attached as a **link on the training task** (not as a blank embed here). Your specialist pastes the cohort URL — there is no guessed Storylane address in this library.

Optional: Training 4 (group notes), ePrescribe, Inpatient/MAT — only if those are in scope for your site.`,
        kind: "ARTICLE",
        audienceRole: "all",
        order: 0,
        isPlaceholder: false,
      },
      {
        slugKey: "training-how-it-works",
        title: "How training works",
        summary: "Five core sessions in sequence, optional group notes, then billing/payroll tracks.",
        body: `Schedule each session from the matching **Schedule Training** action item. Confirm users have logged in before Training 1.

Core sequence:

1. Training 1 — Intro to PIMSY, client charts, appointments/calendar
2. Training 2 — Client charts
3. Training 3 — Appointments & notes
4. Training 4 — Group notes (only if your practice uses group notes)
5. Training 5 — Intake

Checklists on the task are the source of truth for that cohort. This Learning Center explains the topics; it does not duplicate your site’s completion state.`,
        kind: "ARTICLE",
        audienceRole: "all",
        order: 1,
        isPlaceholder: false,
      },
      {
        slugKey: "training-1",
        title: "Training 1: Intro to PIMSY, Client Charts, Appointments/Calendar",
        summary:
          "User profile, provider dashboard, appointment widget, client management, create/term.",
        body: `Areas to cover (same checkboxes as on the Training 1 task):

- User Profile / Signature Capture
- Provider Dashboard
- Appointment Widget
- Client Management (active, inactive, groups, favorites)
- Client Create / Term

Storylane: when your specialist shares a walkthrough, it is a LINK on that task — not an unlabeled PDF on this page.

Use test/demo clients only in training — never real patient records in this workspace.`,
        kind: "ARTICLE",
        audienceRole: "all",
        order: 2,
        isPlaceholder: false,
        replaceTitles: ["Training 1 — Intro to PIMSY"],
      },
      {
        slugKey: "training-2",
        title: "Training 2: Client Charts",
        summary: "Creating a client, demographics, diagnoses, treatment plans, documents.",
        body: `Areas to cover (same checkboxes as on the Training 2 task):

- Creating a client
- Demographics and contacts
- Diagnoses
- Treatment planning
- Chart documents

Use test/demo clients only in training — never real patient records in this workspace.`,
        kind: "ARTICLE",
        audienceRole: "clinical",
        order: 3,
        isPlaceholder: false,
        replaceTitles: ["Training 2 — Client charts"],
      },
      {
        slugKey: "training-3",
        title: "Training 3: Appointments & Notes",
        summary: "Scheduling, progress notes, checkout payments.",
        body: `Areas to cover (same checkboxes as on the Training 3 task):

- Scheduling appointments
- Progress notes and note templates
- Payments at checkout
- Paisly Ambient Scribe (if in scope)

Named how-tos for calendar, notes, and taking a payment live under **Reference** and **Billing**. Use test/demo clients only.`,
        kind: "ARTICLE",
        audienceRole: "clinical",
        order: 4,
        isPlaceholder: false,
        replaceTitles: ["Training 3 — Appointments & notes"],
      },
      {
        slugKey: "training-4",
        title: "Training 4: Group Notes (if applicable)",
        summary: "Group session setup, group notes, attendance — only if your site uses group notes.",
        body: `Training 4 is optional. Skip it (or mark the project task N/A) when the practice does not document group sessions.

Areas to cover (same checkboxes as on the Training 4 task):

- Group session setup
- Group note documentation
- Attendance and individual follow-up notes

This card sits between Training 3 and Training 5 so the catalog matches the playbook sequence — Dock and PATH both treat group notes as session 4 when in scope.

Use test/demo clients only in training — never real patient records in this workspace.`,
        kind: "ARTICLE",
        audienceRole: "clinical",
        order: 5,
        isPlaceholder: false,
      },
      {
        slugKey: "training-5",
        title: "Training 5: Intake",
        summary: "Intake Assistant, inquiry-to-chart, consents.",
        body: `Areas to cover (same checkboxes as on the Training 5 task):

- Intake Assistant / public forms
- New-client workflow from inquiry to chart
- Consents and required intake documents

Use test/demo clients only in training — never real patient records in this workspace.`,
        kind: "ARTICLE",
        audienceRole: "clinical",
        order: 6,
        isPlaceholder: false,
        replaceTitles: ["Training 5 — Intake"],
      },
    ],
  },
  {
    slug: "billing",
    title: "Billing",
    description: "Questionnaire, accepted payers & modifiers, ClaimMD, and how to take a payment.",
    topic: "billing",
    audienceRole: "billing",
    order: 30,
    items: [
      {
        slugKey: "billing-questionnaire",
        title: "Billing questionnaire",
        summary: "Submit the questionnaire, then upload completed files on the Discovery task.",
        body: `Submit the billing questionnaire, then upload the completed files on **Billing Questionnaire** (Discovery). Your specialist reviews the data sheet on **Review Billing Questionnaire Data Sheet** in Site Configuration.

Do not put claim-level or patient detail in this workspace.`,
        kind: "ARTICLE",
        audienceRole: "billing",
        order: 0,
        isPlaceholder: false,
        librarySlug: "billing-questionnaire",
      },
      {
        slugKey: "billing-spreadsheet",
        title: "Accepted payers & modifiers",
        summary: "The spreadsheet Dock ships with the Implementation template.",
        body: `Complete the accepted payers / modifiers spreadsheet and upload it on **Complete & Upload Billing Spreadsheet**. If this card still says placeholder, the live xlsx has not been dropped into the file library yet — use the copy on the task, or ask your specialist.`,
        kind: "FILE",
        audienceRole: "billing",
        order: 1,
        librarySlug: "billing-spreadsheet",
        isPlaceholder: true,
      },
      {
        slugKey: "claimmd",
        title: "ClaimMD enrollment",
        summary: "Enrollment is a practice action item — keep status on that task.",
        body: `ClaimMD enrollment is on your Billing phase as a customer action item. Questions belong on that task or in Messages, not as patient-level detail.

PATH does not invent a ClaimMD portal URL. Use the enrollment path your specialist (or ClaimMD) sends on that task.`,
        kind: "ARTICLE",
        audienceRole: "billing",
        order: 2,
        isPlaceholder: false,
      },
      {
        slugKey: "take-a-payment",
        title: "Take a payment",
        summary: "Checkout / copay how-to. Walkthrough URL pending — not a blank embed.",
        body: `Dock listed **Take a Payment** under Scheduling Storylane how-tos. PATH keeps it here on the billing journey so billing staff can find it without an unlabeled PDF.

Covered in Training 3 (payments at checkout) and later in Client Payment Training (Tier 2) after go-live.

${STORYLANE_PLACEHOLDER_NOTE}

Do not post card numbers, claim-level, or patient payment detail in this workspace.`,
        kind: "LINK",
        audienceRole: "billing",
        order: 3,
        isPlaceholder: true,
      },
    ],
  },
  {
    slug: "go-live",
    title: "Go-live",
    description: "The readiness gate. Every line must be true before you go live.",
    topic: "go_live",
    audienceRole: "all",
    order: 40,
    items: [
      {
        slugKey: "go-live-checklist",
        title: "Go-live checklist (what “ready” means)",
        summary: "Staff trained, appointments set, portal/website, import, payments, eRx, telehealth.",
        body: `The Go-Live Checklist phase in your project is the source of truth. Typical gates:

- Clinical staff trained on scheduling, client entry, diagnoses, treatment planning, documentation
- Scheduling staff trained on scheduling, client entry, and payments
- Appointments set for the coming day(s)
- Client portal configured
- Website updated for Client Portal and/or Intake Assistant
- Client import completed & validated (if in scope)
- Credit card configuration (if in scope)
- Appointment reminders (if in scope)
- eRx configured (if in scope)
- Telehealth set up (if in scope)

Check those items off on the project tasks — this article is the map, not a second copy of your site’s status.`,
        kind: "ARTICLE",
        audienceRole: "admin",
        order: 0,
        isPlaceholder: false,
      },
    ],
  },
  {
    slug: "after-go-live",
    title: "After go-live",
    description: "Tier 2 billing and payroll, then the survey and handoff to support.",
    topic: "after_go_live",
    audienceRole: "all",
    order: 50,
    items: [
      {
        slugKey: "tier-2",
        title: "Tier 2 training",
        summary: "Billing 4–5, payroll 2, and client payments after you are live.",
        body: `After go-live, billing and payroll continue with Tier 2 sessions. Those tasks live in **Post Go-Live (Tier 2)**. Recordings attach on the task, same as core training.`,
        kind: "ARTICLE",
        audienceRole: "billing",
        order: 0,
        isPlaceholder: false,
      },
      {
        slugKey: "survey-and-support",
        title: "Survey and support handoff",
        summary: "Close the loop, then Zendesk / support owns break-fix.",
        body: `Please complete the post go-live survey when it appears on your task list. Ongoing product questions go through the support channel your specialist names at handoff — not as patient-level tickets in this workspace.`,
        kind: "ARTICLE",
        audienceRole: "admin",
        order: 1,
        isPlaceholder: false,
      },
    ],
  },
  {
    slug: "reference",
    title: "Reference",
    description:
      "Scheduling, Notes, and Providers — Dock buried these as unlabeled PDFs and Storylane tiles; PATH gives each how-to a real title.",
    topic: "reference",
    audienceRole: "all",
    order: 60,
    items: [
      {
        slugKey: "scheduling",
        title: "Scheduling",
        summary: "Calendar, recurring appointments, telehealth — named how-tos, not a blank PDF.",
        body: `Scheduling training covers the calendar, the appointment widget, and how schedulers vs. providers book. The live checklist lives on your Training 1 / Training 3 tasks.

Named how-tos in this section (Dock listed these under Scheduling):

- Navigate Calendar
- Recurring Appointments
- Telehealth

**Take a payment** lives under **Billing** (same Dock Storylane topic, easier to find on the billing journey).

Site-specific recordings attach on the project task after the session. This card is an article, not a blank PDF viewer.`,
        kind: "ARTICLE",
        audienceRole: "clinical",
        order: 0,
        isPlaceholder: false,
      },
      walkthrough({
        slugKey: "navigate-calendar",
        title: "Navigate Calendar",
        group: "Scheduling",
        summary: "Find the calendar, move between days/weeks, and open an appointment.",
        steps: `Typical flow in training:

1. Open the calendar from the appointment widget / schedule view.
2. Move between day, week, and provider views.
3. Open an existing appointment without changing clinical data on a real client.

Your Training 1 (Appointment Widget) and Training 3 (scheduling) tasks are the source of truth for what this cohort covered.`,
        audienceRole: "clinical",
        order: 1,
      }),
      walkthrough({
        slugKey: "recurring-appointments",
        title: "Recurring Appointments",
        group: "Scheduling",
        summary: "Set a repeating appointment series on a demo client.",
        steps: `Typical flow in training:

1. Create or open a demo appointment.
2. Set the recurrence pattern your specialist demonstrates.
3. Confirm the series on the calendar, then edit or cancel a single occurrence vs. the series as trained.

Do not build production series for real clients from this workspace.`,
        audienceRole: "clinical",
        order: 2,
      }),
      walkthrough({
        slugKey: "telehealth",
        title: "Telehealth",
        group: "Scheduling",
        summary: "Launch a telehealth visit from the appointment (when in scope).",
        steps: `Typical flow in training (only if telehealth is in scope for your site):

1. Open a demo telehealth appointment.
2. Use the launch path your specialist shows (client vs. provider).
3. Confirm go-live checklist coverage: telehealth set up (if in scope).

Skip this card when telehealth is out of scope — tell your specialist rather than inventing a meeting link.`,
        audienceRole: "clinical",
        order: 3,
      }),
      {
        slugKey: "notes",
        title: "Notes",
        summary: "Progress notes, group notes, Ambient Scribe, favorite tabs — titled cards, not a PDF dump.",
        body: `Progress notes and templates are covered in Training 3 (and group notes in Training 4 when in scope). Use demo clients only.

Named how-tos in this section (Dock listed these under Notes):

- Ambient Scribe
- Group Note
- Note
- Favorite tabs

Ask your specialist before changing note templates in production. Do not paste clinical note text into this workspace.`,
        kind: "ARTICLE",
        audienceRole: "clinical",
        order: 4,
        isPlaceholder: false,
      },
      walkthrough({
        slugKey: "ambient-scribe",
        title: "Ambient Scribe",
        group: "Notes",
        summary: "Paisly Ambient Scribe — only if it is in scope for your site.",
        steps: `Typical flow in training (Training 3 checkbox: Paisly Ambient Scribe if in scope):

1. Confirm Ambient Scribe is in scope; otherwise mark the project task N/A.
2. Follow the self-serve setup your specialist assigned.
3. Capture a demo note only — never a real encounter in this workspace.

The live “Paisly Ambient Scribe (self-serve)” task on Training 3 is the source of truth.`,
        audienceRole: "clinical",
        order: 5,
      }),
      walkthrough({
        slugKey: "group-note",
        title: "Group Note",
        group: "Notes",
        summary: "Document a group session — Training 4 when your site uses group notes.",
        steps: `Typical flow (Training 4, if applicable):

1. Open a demo group session.
2. Complete the group note.
3. Record attendance and any individual follow-up notes as trained.

If the practice does not use group notes, skip Training 4 and this card.`,
        audienceRole: "clinical",
        order: 6,
      }),
      walkthrough({
        slugKey: "note",
        title: "Note",
        group: "Notes",
        summary: "Open a progress note template and complete a demo note.",
        steps: `Typical flow in Training 3:

1. Open a demo client chart.
2. Start the progress note template your specialist demonstrates.
3. Sign or save per the training checklist — never paste real clinical text into PATH.

Ask before changing production note templates.`,
        audienceRole: "clinical",
        order: 7,
      }),
      walkthrough({
        slugKey: "favorite-tabs",
        title: "Favorite tabs",
        group: "Notes",
        summary: "Pin the chart tabs your trainers use every day.",
        steps: `Typical flow (also covered under Training 1 client management / favorites):

1. Open a demo client chart.
2. Favorite the tabs your specialist recommends for this role.
3. Confirm favorites persist for that training user.

Favorites are a trainer preference — not a place to store patient lists.`,
        audienceRole: "clinical",
        order: 8,
      }),
      {
        slugKey: "providers",
        title: "Providers",
        summary: "Provider dashboard, signatures, and prescriptions — titled cards, not a blank embed.",
        body: `Provider setup includes the provider dashboard, signature capture, and keeping the active provider list current. Training 1 checkboxes cover User Profile / Signature Capture and the Provider Dashboard.

Named how-tos in this section (Dock listed these under Providers):

- Provider Portal Dashboard
- Manage Prescriptions with DrFirst

Staffing questions (who is a trainer vs. who is a provider) belong on Kickoff / staffing tasks, not as PHI in Messages.`,
        kind: "ARTICLE",
        audienceRole: "admin",
        order: 9,
        isPlaceholder: false,
      },
      walkthrough({
        slugKey: "provider-portal-dashboard",
        title: "Provider Portal Dashboard",
        group: "Providers",
        summary: "What providers see on sign-in: dashboard widgets and next appointments.",
        steps: `Typical flow in Training 1:

1. Sign in as a demo provider (not a production prescriber session in this workspace).
2. Review the Provider Dashboard widgets your specialist points out.
3. Open the appointment widget from the dashboard.

User Profile / Signature Capture is a separate Training 1 checkbox.`,
        audienceRole: "clinical",
        order: 10,
      }),
      walkthrough({
        slugKey: "manage-prescriptions-drfirst",
        title: "Manage Prescriptions with DrFirst",
        group: "Providers",
        summary: "ePrescribe / DrFirst — only if prescribing is in scope.",
        steps: `Typical flow (ePrescribe track, not core Training 1–5):

1. Confirm ePrescribe is in scope; otherwise skip.
2. Use the prescriber workspace / queues your specialist demonstrates on a demo patient.
3. EPCS, ID proofing, and PDMP stay on the ePrescribe project tasks — including the DrFirst bamboo link your specialist provides. PATH does not invent that URL.

Never send live prescription or patient identifiers in Messages.`,
        audienceRole: "clinical",
        order: 11,
      }),
    ],
  },
];

export function learningSearchHaystack(input: {
  title: string;
  summary?: string | null;
  body?: string | null;
  sectionTitle: string;
  topicLabel: string;
  audienceRole: string;
}): string {
  return [
    input.title,
    input.summary,
    input.body,
    input.sectionTitle,
    input.topicLabel,
    input.audienceRole,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** URLs the seed may wire — used in tests so we never ship a guessed Storylane host. */
export function learningCatalogWiredUrls(): string[] {
  return LEARNING_CENTER_SECTIONS.flatMap((section) =>
    section.items.map((item) => item.url).filter((url): url is string => Boolean(url)),
  );
}
