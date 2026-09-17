/**
 * Customer Learning Center — PIMSY EHR how-tos, not PATH.
 *
 * Dock’s Implementation Template Learning Center is a flat page of unlabeled
 * PDFs and Storylane tiles (Intro, Training Guide, Getting Started, Overview,
 * Password Reset, Scheduling, Notes, Providers). PATH keeps that same customer
 * content, grouped with real titles:
 *
 *   Getting started · Password & access · Scheduling · Notes · Providers
 *   · Training (PIMSY) · Reference
 *
 * This library teaches the PIMSY product (charts, calendar, notes, providers).
 * It is not a map of the implementation project and does not teach PATH
 * (Plan · Assign · Track · Handoff). Discovery worksheets, go-live checklists,
 * and ClaimMD enrollment stay on project tasks — not here.
 *
 * Live URLs are only those already in this repo (PIMSY desktop installer).
 * Storylane / Dock PDFs without a known URL stay clearly marked placeholders.
 * No invented Storylane hosts. No PHI.
 *
 * Re-seed with `npm run db:seed -- --templates-only`. No schema migrate.
 */

export type LearningTopic =
  | "getting_started"
  | "password_access"
  | "scheduling"
  | "notes"
  | "providers"
  | "training"
  | "reference";

export type LearningAudience = "all" | "clinical" | "billing" | "admin";

export const LEARNING_SECTION_SLUGS = [
  "getting-started",
  "password-access",
  "scheduling",
  "notes",
  "providers",
  "training",
  "reference",
] as const;

/** Slugs from the v1.17 PATH-journey draft — seed deletes these sections. */
export const RETIRED_LEARNING_SECTION_SLUGS = [
  "discovery",
  "billing",
  "go-live",
  "after-go-live",
] as const;

export const LEARNING_TOPIC_META: Record<
  LearningTopic,
  { label: string; blurb: string }
> = {
  getting_started: {
    label: "Getting started",
    blurb: "Intro, Getting Started, Overview, and the Training Guide for PIMSY.",
  },
  password_access: {
    label: "Password & access",
    blurb: "PIMSY password reset and desktop / web access.",
  },
  scheduling: {
    label: "Scheduling",
    blurb: "Calendar, recurring appointments, telehealth, take a payment.",
  },
  notes: {
    label: "Notes",
    blurb: "Progress notes, group notes, Ambient Scribe, favorite tabs.",
  },
  providers: {
    label: "Providers",
    blurb: "Provider dashboard and DrFirst prescriptions.",
  },
  training: {
    label: "Training",
    blurb: "PIMSY product modules — charts, appointments, notes, intake.",
  },
  reference: {
    label: "Reference",
    blurb: "Short PIMSY reference cards with real titles.",
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

/** Documented Help Desk installer page — same URL Accessing Pimsy attaches. */
export const LEARNING_DESKTOP_INSTALL_URL = "https://pimsyehr.com/solutions/install-pimsy/";

const STORYLANE_PLACEHOLDER_NOTE =
  "Interactive Storylane walkthrough: your specialist pastes this cohort’s URL on this card when it is known. PATH does not invent a Storylane address. Until then this card stays a named placeholder — not an unlabeled “View PDF” or a blank embed.";

const DEMO_CLIENT_NOTE = "Practice in PIMSY on test/demo clients only — never real patient records.";

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
    body: `${input.group} how-to in PIMSY (Dock listed this under ${input.group}).

${input.steps}

${STORYLANE_PLACEHOLDER_NOTE}

${DEMO_CLIENT_NOTE}`,
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
      "Intro, Getting Started, Overview, and the Training Guide — PIMSY product orientation, not a project map.",
    topic: "getting_started",
    audienceRole: "all",
    order: 0,
    items: [
      {
        slugKey: "intro",
        title: "Intro to PIMSY",
        summary: "What PIMSY is: your electronic health record for charts, calendar, notes, and billing.",
        body: `PIMSY is your electronic health record. Client charts, the calendar, notes, and billing live in PIMSY.

This Learning Center is guides and Storylane walkthroughs for using PIMSY. Each topic is a card with a real title — not an unlabeled “View PDF” or a blank embed.

Do not paste patient names, charts, or clinical detail into this portal. Training uses demo/test clients inside PIMSY.`,
        kind: "ARTICLE",
        audienceRole: "all",
        order: 0,
        isPlaceholder: false,
        replaceTitles: ["Welcome to your implementation workspace"],
      },
      {
        slugKey: "getting-started",
        title: "Getting started",
        summary: "First sign-in to PIMSY: web vs desktop, profile, and a demo chart.",
        body: `Sign in to PIMSY on the web or the Windows desktop app (see **Password & access**). Open your user profile, capture a signature if you are a provider, then open the calendar and a demo client chart so you know where work lives.

Dock shipped this as a Getting Started PDF. This card keeps the same title. If the Dock PDF is uploaded later, your specialist can attach it here — there is no blank “View PDF” button.

${DEMO_CLIENT_NOTE}`,
        kind: "ARTICLE",
        audienceRole: "all",
        order: 1,
        isPlaceholder: false,
      },
      {
        slugKey: "overview",
        title: "Overview",
        summary: "Where work lives in PIMSY: calendar, charts, notes, provider dashboard, intake.",
        body: `PIMSY is organized around the work you do in the EHR:

- Calendar and appointments
- Client charts (demographics, diagnoses, documents)
- Notes and templates
- Provider dashboard
- Intake Assistant (inquiry / public forms, when you use them)

Use **Scheduling**, **Notes**, **Providers**, and **Training** in this library for step-by-step how-tos. This page is not a second copy of PIMSY.

${DEMO_CLIENT_NOTE}`,
        kind: "ARTICLE",
        audienceRole: "all",
        order: 2,
        isPlaceholder: false,
        replaceTitles: ["Finding your way around"],
      },
      {
        slugKey: "training-guide",
        title: "Training Guide",
        summary: "How trainers learn PIMSY: charts, calendar, notes, and intake.",
        body: `The Training Guide covers how trainers learn PIMSY — client charts, the calendar, notes, and intake — then teach the rest of the practice.

Dock shipped this as a PDF. This card keeps the title. If Alexander later uploads the Dock PDF, staff can attach it here.

PIMSY product modules in this library (Training section):

1. Intro to PIMSY, client charts, appointments/calendar
2. Client charts
3. Appointments & notes
4. Group notes (only if your practice documents group sessions)
5. Intake

Interactive Storylane walkthroughs for calendar, notes, and providers live in those sections. Your specialist pastes the cohort URL when it is known — there is no guessed Storylane address here.`,
        kind: "ARTICLE",
        audienceRole: "all",
        order: 3,
        isPlaceholder: false,
      },
    ],
  },
  {
    slug: "password-access",
    title: "Password & access",
    description: "Reset a PIMSY password and install or bookmark the EHR — not this portal’s login.",
    topic: "password_access",
    audienceRole: "all",
    order: 10,
    items: [
      {
        slugKey: "password-reset",
        title: "Password reset",
        summary: "Reset a PIMSY login. Storylane walkthrough pending — not a blank embed.",
        body: `On the PIMSY sign-in page, use Forgot password. If your practice uses SSO, follow your IT process instead.

Dock listed this as a Storylane walkthrough. Until your specialist pastes that cohort URL on this card, use the PIMSY sign-in page. PATH does not invent a Storylane address.

This implementation portal is a separate login from PIMSY. Do not send passwords in chat or email.`,
        kind: "LINK",
        audienceRole: "all",
        order: 0,
        isPlaceholder: true,
      },
      {
        slugKey: "access",
        title: "Access",
        summary: "PIMSY desktop app, web bookmark, practice acronym, and security key.",
        body: `Install the PIMSY Windows desktop app from the Help Desk page on this card. During setup you enter the practice acronym and security key your specialist provides.

Your PIMSY web bookmark is practice-specific — your specialist gives you that URL. This card does not guess a tenant host.

Do not send security keys or passwords in chat or email.`,
        kind: "LINK",
        audienceRole: "all",
        order: 1,
        librarySlug: "pimsy-desktop-install",
        url: LEARNING_DESKTOP_INSTALL_URL,
        isPlaceholder: false,
      },
    ],
  },
  {
    slug: "scheduling",
    title: "Scheduling",
    description: "PIMSY calendar how-tos Dock listed as Storylanes — named cards, not unlabeled tiles.",
    topic: "scheduling",
    audienceRole: "clinical",
    order: 20,
    items: [
      walkthrough({
        slugKey: "navigate-calendar",
        title: "Navigate Calendar",
        group: "Scheduling",
        summary: "Find the calendar, move between days/weeks, and open an appointment.",
        steps: `In PIMSY:

1. Open the calendar from the appointment widget / schedule view.
2. Move between day, week, and provider views.
3. Open an existing appointment on a demo client.`,
        audienceRole: "clinical",
        order: 0,
      }),
      walkthrough({
        slugKey: "recurring-appointments",
        title: "Recurring Appointments",
        group: "Scheduling",
        summary: "Set a repeating appointment series on a demo client.",
        steps: `In PIMSY:

1. Create or open a demo appointment.
2. Set the recurrence pattern.
3. Confirm the series on the calendar, then edit or cancel a single occurrence vs. the series as trained.`,
        audienceRole: "clinical",
        order: 1,
      }),
      walkthrough({
        slugKey: "telehealth",
        title: "Telehealth",
        group: "Scheduling",
        summary: "Launch a telehealth visit from the appointment (when in scope).",
        steps: `In PIMSY (only if telehealth is in scope):

1. Open a demo telehealth appointment.
2. Use the launch path your specialist shows (client vs. provider).

Skip this card when telehealth is out of scope — do not invent a meeting link.`,
        audienceRole: "clinical",
        order: 2,
      }),
      walkthrough({
        slugKey: "take-a-payment",
        title: "Take a payment",
        group: "Scheduling",
        summary: "Collect a copay / checkout payment in PIMSY.",
        steps: `In PIMSY:

1. Open a demo appointment at checkout.
2. Take the payment the way your specialist demonstrates (card / other tender).
3. Confirm the receipt posts on the demo client.

Do not post card numbers or real patient payment detail in this portal.`,
        audienceRole: "billing",
        order: 3,
      }),
    ],
  },
  {
    slug: "notes",
    title: "Notes",
    description: "PIMSY note how-tos Dock listed as Storylanes — titled cards, not a PDF dump.",
    topic: "notes",
    audienceRole: "clinical",
    order: 30,
    items: [
      walkthrough({
        slugKey: "ambient-scribe",
        title: "Ambient Scribe",
        group: "Notes",
        summary: "Paisly Ambient Scribe in PIMSY — only if it is in scope.",
        steps: `In PIMSY (only if Ambient Scribe is in scope):

1. Open a demo encounter.
2. Follow the Ambient Scribe path your specialist shows.
3. Capture a demo note only — never a real encounter in this portal.`,
        audienceRole: "clinical",
        order: 0,
      }),
      walkthrough({
        slugKey: "group-note",
        title: "Group Note",
        group: "Notes",
        summary: "Document a group session in PIMSY when your site uses group notes.",
        steps: `In PIMSY (only if you document group sessions):

1. Open a demo group session.
2. Complete the group note.
3. Record attendance and any individual follow-up notes as trained.`,
        audienceRole: "clinical",
        order: 1,
      }),
      walkthrough({
        slugKey: "note",
        title: "Note",
        group: "Notes",
        summary: "Open a progress note template and complete a demo note in PIMSY.",
        steps: `In PIMSY:

1. Open a demo client chart.
2. Start the progress note template.
3. Sign or save as trained. Do not paste real clinical text into this portal.`,
        audienceRole: "clinical",
        order: 2,
      }),
      walkthrough({
        slugKey: "favorite-tabs",
        title: "Favorite tabs",
        group: "Notes",
        summary: "Pin the chart tabs you use every day in PIMSY.",
        steps: `In PIMSY:

1. Open a demo client chart.
2. Favorite the tabs for your role.
3. Confirm favorites persist for that training user.

Favorites are a preference — not a place to store patient lists.`,
        audienceRole: "clinical",
        order: 3,
      }),
    ],
  },
  {
    slug: "providers",
    title: "Providers",
    description: "Provider dashboard and prescriptions in PIMSY — named how-tos, not a blank embed.",
    topic: "providers",
    audienceRole: "clinical",
    order: 40,
    items: [
      walkthrough({
        slugKey: "provider-portal-dashboard",
        title: "Provider Portal Dashboard",
        group: "Providers",
        summary: "What providers see in PIMSY on sign-in: dashboard widgets and next appointments.",
        steps: `In PIMSY:

1. Sign in as a demo provider.
2. Review the Provider Dashboard widgets.
3. Open the appointment widget from the dashboard.

User Profile / Signature Capture is covered under Training 1 and Reference.`,
        audienceRole: "clinical",
        order: 0,
      }),
      walkthrough({
        slugKey: "manage-prescriptions-drfirst",
        title: "Manage Prescriptions with DrFirst",
        group: "Providers",
        summary: "ePrescribe / DrFirst in PIMSY — only if prescribing is in scope.",
        steps: `In PIMSY (only if ePrescribe is in scope):

1. Open the prescriber workspace / queues on a demo patient.
2. Send or manage a demo prescription as trained.
3. EPCS, ID proofing, and PDMP stay in PIMSY. PATH does not invent a DrFirst bamboo URL.

Never send live prescription or patient identifiers in this portal.`,
        audienceRole: "clinical",
        order: 1,
      }),
    ],
  },
  {
    slug: "training",
    title: "Training",
    description:
      "PIMSY product modules in order — client charts, appointments, notes, group notes, intake. Not a PATH project timeline.",
    topic: "training",
    audienceRole: "clinical",
    order: 50,
    items: [
      {
        slugKey: "training-how-it-works",
        title: "How training works",
        summary: "Five PIMSY modules in sequence; group notes only if you use them.",
        body: `Trainers learn PIMSY in this order, then teach the rest of the practice:

1. Training 1 — Intro to PIMSY, client charts, appointments/calendar
2. Training 2 — Client charts
3. Training 3 — Appointments & notes
4. Training 4 — Group notes (only if your practice uses group notes)
5. Training 5 — Intake

Each module below lists what to cover in PIMSY. Scheduling, notes, and provider Storylanes are in those sections.

${DEMO_CLIENT_NOTE}`,
        kind: "ARTICLE",
        audienceRole: "all",
        order: 0,
        isPlaceholder: false,
      },
      {
        slugKey: "training-1",
        title: "Training 1: Intro to PIMSY, Client Charts, Appointments/Calendar",
        summary: "User profile, provider dashboard, appointment widget, client management, create/term.",
        body: `PIMSY topics in this module:

- User Profile / Signature Capture
- Provider Dashboard
- Appointment Widget
- Client Management (active, inactive, groups, favorites)
- Client Create / Term

Storylane walkthroughs for calendar and the provider dashboard are under **Scheduling** and **Providers**.

${DEMO_CLIENT_NOTE}`,
        kind: "ARTICLE",
        audienceRole: "all",
        order: 1,
        isPlaceholder: false,
        replaceTitles: ["Training 1 — Intro to PIMSY"],
      },
      {
        slugKey: "training-2",
        title: "Training 2: Client Charts",
        summary: "Creating a client, demographics, diagnoses, treatment plans, documents in PIMSY.",
        body: `PIMSY topics in this module:

- Creating a client
- Demographics and contacts
- Diagnoses
- Treatment planning
- Chart documents

${DEMO_CLIENT_NOTE}`,
        kind: "ARTICLE",
        audienceRole: "clinical",
        order: 2,
        isPlaceholder: false,
        replaceTitles: ["Training 2 — Client charts"],
      },
      {
        slugKey: "training-3",
        title: "Training 3: Appointments & Notes",
        summary: "Scheduling, progress notes, checkout payments in PIMSY.",
        body: `PIMSY topics in this module:

- Scheduling appointments
- Progress notes and note templates
- Payments at checkout
- Paisly Ambient Scribe (if in scope)

See **Scheduling** and **Notes** for named Storylane how-tos (calendar, telehealth, take a payment, notes).

${DEMO_CLIENT_NOTE}`,
        kind: "ARTICLE",
        audienceRole: "clinical",
        order: 3,
        isPlaceholder: false,
        replaceTitles: ["Training 3 — Appointments & notes"],
      },
      {
        slugKey: "training-4",
        title: "Training 4: Group Notes (if applicable)",
        summary: "Group session setup, group notes, attendance in PIMSY — only if you use group notes.",
        body: `Skip this module when the practice does not document group sessions.

PIMSY topics:

- Group session setup
- Group note documentation
- Attendance and individual follow-up notes

This card sits between Training 3 and Training 5 so the PIMSY modules stay in order. See **Notes → Group Note** for the titled how-to.

${DEMO_CLIENT_NOTE}`,
        kind: "ARTICLE",
        audienceRole: "clinical",
        order: 4,
        isPlaceholder: false,
      },
      {
        slugKey: "training-5",
        title: "Training 5: Intake",
        summary: "Intake Assistant, inquiry-to-chart, consents in PIMSY.",
        body: `PIMSY topics in this module:

- Intake Assistant / public forms
- New-client workflow from inquiry to chart
- Consents and required intake documents

${DEMO_CLIENT_NOTE}`,
        kind: "ARTICLE",
        audienceRole: "clinical",
        order: 5,
        isPlaceholder: false,
        replaceTitles: ["Training 5 — Intake"],
      },
    ],
  },
  {
    slug: "reference",
    title: "Reference",
    description: "Short PIMSY reference cards — named titles, not unlabeled PDFs.",
    topic: "reference",
    audienceRole: "all",
    order: 60,
    items: [
      {
        slugKey: "client-chart",
        title: "Client chart",
        summary: "Where demographics, diagnoses, documents, and notes live on a PIMSY chart.",
        body: `A PIMSY client chart holds demographics and contacts, diagnoses, treatment plans, documents, and notes. Open a demo client from Client Management or from an appointment.

Training 2 covers creating a client and the chart sections in depth. Favorite tabs (Notes section) pin the chart pages you use most.

${DEMO_CLIENT_NOTE}`,
        kind: "ARTICLE",
        audienceRole: "clinical",
        order: 0,
        isPlaceholder: false,
      },
      {
        slugKey: "appointment-widget",
        title: "Appointment widget",
        summary: "Open the PIMSY appointment widget from the dashboard or calendar.",
        body: `The appointment widget is how many providers jump from the dashboard into the day’s schedule. Training 1 covers it with the calendar.

See **Scheduling → Navigate Calendar** for the titled walkthrough.

${DEMO_CLIENT_NOTE}`,
        kind: "ARTICLE",
        audienceRole: "clinical",
        order: 1,
        isPlaceholder: false,
      },
      {
        slugKey: "user-profile-signature",
        title: "User profile and signature",
        summary: "Set your PIMSY profile and capture a signature for notes.",
        body: `Open User Profile in PIMSY. Providers capture a signature used when signing notes. Training 1 covers this with the Provider Dashboard.

Do not share login or signature images in this portal.`,
        kind: "ARTICLE",
        audienceRole: "all",
        order: 2,
        isPlaceholder: false,
      },
      {
        slugKey: "intake-assistant",
        title: "Intake Assistant",
        summary: "Public / inquiry forms into a new PIMSY chart (when in scope).",
        body: `Intake Assistant is PIMSY’s inquiry-to-chart path (public forms, consents, new-client workflow). Training 5 covers it.

Skip this card when Intake Assistant is out of scope.

${DEMO_CLIENT_NOTE}`,
        kind: "ARTICLE",
        audienceRole: "clinical",
        order: 3,
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

/** URLs the seed may wire — used in tests so we never ship a guessed Storylane host. */
export function learningCatalogWiredUrls(): string[] {
  return LEARNING_CENTER_SECTIONS.flatMap((section) =>
    section.items.map((item) => item.url).filter((url): url is string => Boolean(url)),
  );
}
