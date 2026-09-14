/**
 * Customer Learning Center information architecture.
 *
 * Dock’s Learning Center is a flat dump of files. PATH groups by topic
 * (Getting started, Discovery, Training, Billing, Go-live, After go-live)
 * and by role (clinical / billing / admin) so a practice can find the
 * right material without scrolling a warehouse.
 *
 * Seed items are articles + placeholders — no PHI, no invented recordings.
 * Staff replace placeholders from the Learning Center admin page.
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

export const LEARNING_TOPIC_META: Record<
  LearningTopic,
  { label: string; blurb: string }
> = {
  getting_started: {
    label: "Getting started",
    blurb: "How this workspace works, who to talk to, and what the first weeks look like.",
  },
  discovery: {
    label: "Discovery",
    blurb: "Forms and worksheets we need before configuration starts.",
  },
  training: {
    label: "Training",
    blurb: "Train-the-trainer modules, what each session covers, and where recordings land.",
  },
  billing: {
    label: "Billing",
    blurb: "ClaimMD, codes & rates, authorizations, invoicing, and payroll.",
  },
  go_live: {
    label: "Go-live",
    blurb: "The gate checklist and day-of logistics — no patient data here.",
  },
  after_go_live: {
    label: "After go-live",
    blurb: "Tier 2 billing/payroll and how support takes over.",
  },
  reference: {
    label: "Reference",
    blurb: "Short how-tos that don’t belong to a single week of the project.",
  },
};

export const LEARNING_AUDIENCE_LABEL: Record<LearningAudience, string> = {
  all: "Everyone",
  clinical: "Clinical",
  billing: "Billing",
  admin: "Admin / leadership",
};

export type LearningSectionSeed = {
  slug: string;
  title: string;
  description: string;
  topic: LearningTopic;
  audienceRole: LearningAudience;
  order: number;
  items: Array<{
    slugKey: string;
    title: string;
    summary: string;
    body: string;
    kind: "ARTICLE" | "LINK" | "FILE";
    audienceRole: LearningAudience;
    order: number;
    librarySlug?: string;
  }>;
};

export const LEARNING_CENTER_SECTIONS: LearningSectionSeed[] = [
  {
    slug: "getting-started",
    title: "Getting started",
    description: "Orientation for everyone at the practice who will use this workspace.",
    topic: "getting_started",
    audienceRole: "all",
    order: 0,
    items: [
      {
        slugKey: "welcome-to-path",
        title: "Welcome to your implementation workspace",
        summary: "What this portal is for, and what it is not (no patient information).",
        body: `This workspace tracks your PIMSY implementation: timelines, configuration checklists, training, and messages with your specialist.

Please do not post patient names, charts, or clinical detail here. If you need to send that kind of information, ask your specialist for the secure channel.

Use **Your action items** on the home screen for work that is waiting on your team. Use **Messages** for questions. Use this Learning Center for how-tos and worksheets — grouped by topic so you are not hunting through a flat file list.`,
        kind: "ARTICLE",
        audienceRole: "all",
        order: 0,
      },
      {
        slugKey: "path-overview",
        title: "Finding your way around",
        summary: "Areas, messages, recordings, and where files live on a task.",
        body: `Each project has **Areas** (phases such as Kickoff, Discovery, Training). Open an area to see the shared tasks. A violet **Yours** badge means your team owns that step.

Shared files on a task appear under **Links & files**. Training recordings, when your specialist adds them, show under **Recordings**.

The Learning Center (this page) is the same for every project — it is your practice library, not a dump of every file from every site.`,
        kind: "ARTICLE",
        audienceRole: "all",
        order: 1,
      },
    ],
  },
  {
    slug: "discovery",
    title: "Discovery",
    description: "Worksheets and forms before configuration. Upload completed copies on the matching task.",
    topic: "discovery",
    audienceRole: "admin",
    order: 10,
    items: [
      {
        slugKey: "discovery-wizard",
        title: "Discovery Wizard",
        summary: "The guided discovery workbook. Placeholder until the live file is uploaded.",
        body: `Your specialist will walk this during Guided Discovery. Complete the practice sections and attach the finished file on the **Organization Details Form** / **Clinical Workflows** tasks — not in email.

If this card still says placeholder, the live Dock file has not been dropped into PATH yet. Use the copy attached to those tasks, or ask your specialist.`,
        kind: "FILE",
        audienceRole: "admin",
        order: 0,
        librarySlug: "discovery-wizard",
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
        librarySlug: "clinical-workflows-sheet",
      },
    ],
  },
  {
    slug: "training",
    title: "Training modules",
    description: "Train-the-trainer sessions. Each module lists areas to cover; recordings are attached on the project task after the session.",
    topic: "training",
    audienceRole: "clinical",
    order: 20,
    items: [
      {
        slugKey: "training-how-it-works",
        title: "How training works",
        summary: "Five core sessions, optional group notes, then billing/payroll tracks.",
        body: `Core (Train the Trainer) is five sessions. Your trainers attend; they train the rest of the practice.

On each training task your specialist checks off **areas to cover** as they go — you can see those checkboxes on the shared task. After the session, the recording link is attached to that same task (and may also appear under Recordings).

Optional: Training 4 (group notes), ePrescribe, Inpatient/MAT — only if those are in scope for your site.`,
        kind: "ARTICLE",
        audienceRole: "all",
        order: 0,
      },
      {
        slugKey: "training-1",
        title: "Training 1 — Intro to PIMSY",
        summary: "Login, navigation, profile, and where to get help.",
        body: `Typical areas to cover: logging in and the home dashboard; navigation; user profile; where to get help.

Schedule this from the **Schedule Training 1** action item. Confirm users have logged in before the session.`,
        kind: "ARTICLE",
        audienceRole: "all",
        order: 1,
      },
      {
        slugKey: "training-2",
        title: "Training 2 — Client charts",
        summary: "Creating a client, demographics, diagnoses, treatment plans, documents.",
        body: `Typical areas to cover: creating a client; demographics and contacts; diagnoses; treatment planning; chart documents.

Use test/demo clients only in training — never real patient records in this workspace.`,
        kind: "ARTICLE",
        audienceRole: "clinical",
        order: 2,
      },
      {
        slugKey: "training-3",
        title: "Training 3 — Appointments & notes",
        summary: "Scheduling, progress notes, checkout payments.",
        body: `Typical areas to cover: scheduling; progress notes and templates; payments at checkout; Paisly Ambient Scribe when in scope.`,
        kind: "ARTICLE",
        audienceRole: "clinical",
        order: 3,
      },
      {
        slugKey: "training-5",
        title: "Training 5 — Intake",
        summary: "Intake Assistant, inquiry-to-chart, consents.",
        body: `Typical areas to cover: Intake Assistant / public forms; new-client workflow; consents and required intake documents.`,
        kind: "ARTICLE",
        audienceRole: "clinical",
        order: 4,
      },
    ],
  },
  {
    slug: "billing",
    title: "Billing",
    description: "Questionnaires, payer sheets, ClaimMD, and the billing training track.",
    topic: "billing",
    audienceRole: "billing",
    order: 30,
    items: [
      {
        slugKey: "billing-questionnaire",
        title: "Billing questionnaire",
        summary: "How you bill today — complete on the Discovery task.",
        body: `Fill out the billing questionnaire on your Discovery task. Attach the completed file there so your specialist and billing support both see it.`,
        kind: "ARTICLE",
        audienceRole: "billing",
        order: 0,
        librarySlug: "billing-questionnaire",
      },
      {
        slugKey: "billing-spreadsheet",
        title: "Accepted payers & modifiers",
        summary: "The spreadsheet Dock ships with the Implementation template.",
        body: `Complete the accepted payers / modifiers spreadsheet and upload it on **Complete & Upload Billing Spreadsheet**. Placeholder until the live xlsx is in the file library.`,
        kind: "FILE",
        audienceRole: "billing",
        order: 1,
        librarySlug: "billing-spreadsheet",
      },
      {
        slugKey: "claimmd",
        title: "ClaimMD enrollment",
        summary: "Enrollment is a practice action item — keep status on that task.",
        body: `ClaimMD enrollment is on your Billing phase as a customer action item. Questions belong on that task or in Messages, not as patient-level detail.`,
        kind: "ARTICLE",
        audienceRole: "billing",
        order: 2,
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
      },
    ],
  },
  {
    slug: "after-go-live",
    title: "After go-live",
    description: "Tier 2 billing and payroll, then handoff to support.",
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
      },
      {
        slugKey: "survey-and-support",
        title: "Survey and support handoff",
        summary: "Close the loop, then Zendesk / support owns break-fix.",
        body: `Please complete the post go-live survey when it appears on your task list. Ongoing product questions go through the support channel your specialist names at handoff — not as patient-level tickets in this workspace.`,
        kind: "ARTICLE",
        audienceRole: "admin",
        order: 1,
      },
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
