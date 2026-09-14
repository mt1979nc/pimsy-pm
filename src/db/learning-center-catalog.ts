/**
 * Customer Learning Center information architecture.
 *
 * Dock’s Learning Center is a long flat page (Intro, Training Guide, Getting
 * Started, Overview, Password Reset, Scheduling, Notes, Providers) with
 * unlabeled “View PDF” buttons and blank embeds. PATH groups those same
 * topics as titled cards, searchable, with real article bodies — no empty
 * embeds. Customers reach it from the portal (`/portal/learn`).
 *
 * Seed items are articles + the live Discovery Wizard link. File placeholders
 * stay labeled until Alexander uploads binaries. No PHI.
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
    blurb: "Intro, overview, password reset, and how this workspace works.",
  },
  discovery: {
    label: "Discovery",
    blurb: "Forms and worksheets we need before configuration starts.",
  },
  training: {
    label: "Training",
    blurb: "Training Guide, session checklists, and where recordings land.",
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
    blurb: "Scheduling, notes, and providers — short how-tos with real titles.",
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
    url?: string;
    isPlaceholder?: boolean;
    /** Prior seed titles to update in place instead of duplicating. */
    replaceTitles?: string[];
  }>;
};

export const DISCOVERY_WIZARD_LEARNING_URL =
  "https://calm-mud-0fe119810.7.azurestaticapps.net/";

export const LEARNING_CENTER_SECTIONS: LearningSectionSeed[] = [
  {
    slug: "getting-started",
    title: "Getting started",
    description:
      "Dock’s Intro / Getting Started / Overview / Password Reset — as titled cards, not a unlabeled PDF strip.",
    topic: "getting_started",
    audienceRole: "all",
    order: 0,
    items: [
      {
        slugKey: "intro",
        title: "Intro to PIMSY",
        summary: "What PIMSY is for, and what this implementation workspace is not.",
        body: `PIMSY is your electronic health record. This PATH workspace tracks your implementation: timelines, configuration checklists, training, and messages with your specialist.

This portal is not a second copy of the EHR. Please do not post patient names, charts, or clinical detail here. If you need to send that kind of information, ask your specialist for the secure channel.

Use **Your action items** on the home screen for work waiting on your team. Use **Messages** for questions. Use this Learning Center for how-tos — each topic is a card with a real title, not an unlabeled “View PDF”.`,
        kind: "ARTICLE",
        audienceRole: "all",
        order: 0,
        isPlaceholder: false,
        replaceTitles: ["Welcome to your implementation workspace"],
      },
      {
        slugKey: "getting-started",
        title: "Getting started",
        summary: "First weeks: sign in, trainers, and where files live.",
        body: `In the first weeks you will:

1. Confirm your PATH portal login (invite email from your specialist).
2. Name trainers for Core (Train the Trainer) sessions.
3. Complete Discovery worksheets (Organization Details, Clinical Workflows, Billing Questionnaire).
4. Open the Discovery Wizard from the Discovery card (live link — not a blank embed).

Nothing in this workspace should include client/patient lists. Training uses demo/test clients inside PIMSY, not here.`,
        kind: "ARTICLE",
        audienceRole: "all",
        order: 1,
        isPlaceholder: false,
      },
      {
        slugKey: "overview",
        title: "Overview",
        summary: "Areas, messages, recordings, and where files live on a task.",
        body: `Each project has **Areas** (phases such as Kickoff, Discovery, Training). Open an area to see the shared tasks. A violet **Yours** badge means your team owns that step.

Shared files and links on a task appear under **Links & files**. Training recordings, when your specialist adds them, show under **Recordings**.

The Learning Center (this page) is the same for every project — it is your practice library. Search the cards above; we do not dump unlabeled PDFs or empty viewers on one long page.`,
        kind: "ARTICLE",
        audienceRole: "all",
        order: 2,
        isPlaceholder: false,
        replaceTitles: ["Finding your way around"],
      },
      {
        slugKey: "password-reset",
        title: "Password reset",
        summary: "How to reset a PIMSY or PATH login without waiting on a blank how-to embed.",
        body: `**PATH (this workspace):** use Forgot password on the PATH sign-in page, or ask your specialist to resend an invite. Named staff never reset customer passwords by guessing.

**PIMSY (the EHR):** use Forgot password on the PIMSY sign-in page. If your practice uses SSO, follow your IT process instead.

Your specialist can confirm which login you need for training day. Do not send passwords or patient data in Messages.`,
        kind: "ARTICLE",
        audienceRole: "all",
        order: 3,
        isPlaceholder: false,
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
      "Training Guide plus session cards. Each project task lists areas to cover; recordings attach on that task after the session.",
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
        summary: "Five core sessions, optional group notes, then billing/payroll tracks.",
        body: `Schedule each session from the matching **Schedule Training** action item. Confirm users have logged in before Training 1.

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
        title: "Training 2 — Client charts",
        summary: "Creating a client, demographics, diagnoses, treatment plans, documents.",
        body: `Typical areas to cover: creating a client; demographics and contacts; diagnoses; treatment planning; chart documents.

Use test/demo clients only in training — never real patient records in this workspace.`,
        kind: "ARTICLE",
        audienceRole: "clinical",
        order: 3,
        isPlaceholder: false,
      },
      {
        slugKey: "training-3",
        title: "Training 3 — Appointments & notes",
        summary: "Scheduling, progress notes, checkout payments.",
        body: `Typical areas to cover: scheduling; progress notes and templates; payments at checkout; Paisly Ambient Scribe when in scope.`,
        kind: "ARTICLE",
        audienceRole: "clinical",
        order: 4,
        isPlaceholder: false,
      },
      {
        slugKey: "training-5",
        title: "Training 5 — Intake",
        summary: "Intake Assistant, inquiry-to-chart, consents.",
        body: `Typical areas to cover: Intake Assistant / public forms; new-client workflow; consents and required intake documents.`,
        kind: "ARTICLE",
        audienceRole: "clinical",
        order: 5,
        isPlaceholder: false,
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
        body: `ClaimMD enrollment is on your Billing phase as a customer action item. Questions belong on that task or in Messages, not as patient-level detail.`,
        kind: "ARTICLE",
        audienceRole: "billing",
        order: 2,
        isPlaceholder: false,
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
      "Scheduling, Notes, and Providers — Dock buried these as unlabeled PDFs; PATH gives each a titled card.",
    topic: "reference",
    audienceRole: "all",
    order: 60,
    items: [
      {
        slugKey: "scheduling",
        title: "Scheduling",
        summary: "Calendar, appointment widget, and who books what.",
        body: `Scheduling training covers the calendar, the appointment widget, and how schedulers vs. providers book. The live checklist lives on your Training 1 / Appointments tasks.

This card is an article, not a blank PDF viewer. Site-specific recordings attach on the project task after the session.`,
        kind: "ARTICLE",
        audienceRole: "clinical",
        order: 0,
        isPlaceholder: false,
      },
      {
        slugKey: "notes",
        title: "Notes",
        summary: "Progress notes, templates, and where group notes fit.",
        body: `Progress notes and templates are covered in Training 3 (and group notes in Training 4 when in scope). Use demo clients only.

Ask your specialist before changing note templates in production. Do not paste clinical note text into this workspace.`,
        kind: "ARTICLE",
        audienceRole: "clinical",
        order: 1,
        isPlaceholder: false,
      },
      {
        slugKey: "providers",
        title: "Providers",
        summary: "Provider dashboard, signatures, and who is active.",
        body: `Provider setup includes the provider dashboard, signature capture, and keeping the active provider list current. Training 1 checkboxes cover User Profile / Signature Capture and the Provider Dashboard.

Staffing questions (who is a trainer vs. who is a provider) belong on Kickoff / staffing tasks, not as PHI in Messages.`,
        kind: "ARTICLE",
        audienceRole: "admin",
        order: 2,
        isPlaceholder: false,
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
