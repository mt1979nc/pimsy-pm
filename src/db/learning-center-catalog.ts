/**
 * Customer Learning Center — PIMSY EHR how-tos, not PATH.
 *
 * Dock Implementation Template Learning Center assets (2026-09-17 inventory):
 * Storylane walkthroughs + public GCS PDFs. NEVER pimsyehr.dock.us space URLs.
 * NEVER the signed GCS URL for PIMSY Implementation Customer Guide.pdf
 * (re-host in Azure Blob later — omitted here).
 *
 * Groups: Getting started · Password & access · Scheduling · Notes · Providers
 * · Training (PIMSY modules).
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
] as const;

/** Slugs from earlier LC drafts — seed deletes these sections. */
export const RETIRED_LEARNING_SECTION_SLUGS = [
  "discovery",
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
    blurb: "Intro, Getting Started PDF, Overview walkthrough, and implementation tips.",
  },
  password_access: {
    label: "Password & access",
    blurb: "PIMSY password reset walkthrough and desktop / web access.",
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

/** Dock LC Storylane + public PDF URLs (2026-09-17). No dock.us. */
export const DOCK_LC_ASSETS = {
  overview: "https://app.storylane.io/demo/a9lma1ivmt5w?embed=inline",
  passwordReset: "https://app.storylane.io/demo/9nnzycccx3se?embed=inline",
  navigateCalendar: "https://pimsy.storylane.io/share/sgqudqs8txqc",
  recurringAppointments: "https://pimsy.storylane.io/share/1edlxaskezz6",
  telehealth: "https://pimsy.storylane.io/share/ybzqjsqi28bd",
  takeAPayment: "https://pimsy.storylane.io/share/pfhjdnmyz6nd",
  ambientScribe: "https://app.storylane.io/demo/qu8e5jkjq64u?embed=inline",
  groupNote: "https://app.storylane.io/demo/kazgzdm7gp6a?embed=inline",
  note: "https://pimsy.storylane.io/demo/lnuy9mdqyphs?embed=popup",
  favoriteTabs: "https://app.storylane.io/demo/wcdgdncliypx?embed=inline",
  providerDashboard: "https://pimsy.storylane.io/share/fqkineychmzt",
  managePrescriptions: "https://pimsy.storylane.io/share/1vep5hajrbgi",
  gettingStartedPdf:
    "https://storage.googleapis.com/dock-production-public/T21IkHXC36Me/AIGvC3sOwl3t/5169kxJ4tgPF/Getting%20started%20with%20PIMSY%20v2.pdf",
  tipsPdf:
    "https://storage.googleapis.com/dock-production-public/T21IkHXC36Me/AIGvC3sOwl3t/Yb9W6TWTABbE/Tips%20for%20a%20Successful%20implementation%20V2.pdf",
} as const;

/**
 * TODO: PIMSY Implementation Customer Guide.pdf was a private signed GCS URL
 * (expires ~12h). Do not hardcode. Re-host in Azure Blob, then add a Training
 * Guide FILE/LINK here.
 */

/** Documented Help Desk installer page — same URL Accessing Pimsy attaches. */
export const LEARNING_DESKTOP_INSTALL_URL = "https://pimsyehr.com/solutions/install-pimsy/";

export function isLearningDockSpaceUrl(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().includes("dock.us");
  } catch {
    return false;
  }
}

export function isLearningStorylaneUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "storylane.io" || host.endsWith(".storylane.io");
  } catch {
    return false;
  }
}

export function isLearningPdfUrl(url: string): boolean {
  try {
    return /\.pdf$/i.test(new URL(url).pathname);
  } catch {
    return /\.pdf(\?|$)/i.test(url);
  }
}

export function isSignedGcsUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname.includes("googleapis.com") && u.searchParams.has("X-Goog-Signature");
  } catch {
    return /X-Goog-Signature=/i.test(url);
  }
}

/** Iframe src for Storylane `embed=inline` and public PDFs. Share / popup Storylanes open in a new tab. */
export function learningIframeSrc(url: string): string | null {
  if (!url || isLearningDockSpaceUrl(url) || isSignedGcsUrl(url)) return null;
  try {
    const u = new URL(url);
    if (isLearningStorylaneUrl(url) && u.searchParams.get("embed") === "inline") return url;
    if (isLearningPdfUrl(url)) return url;
    return null;
  } catch {
    return null;
  }
}

export function learningKindLabel(kind: string, url?: string | null): string {
  if (url && isLearningStorylaneUrl(url)) return "Walkthrough";
  if (url && isLearningPdfUrl(url)) return "PDF";
  const k = kind.toUpperCase();
  if (k === "LINK") return "Link";
  if (k === "FILE") return "File";
  return "Article";
}

/** Catalog / detail badge when a Dock PDF or Storylane URL is not wired yet. */
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

const DEMO_CLIENT_NOTE = "Practice in PIMSY on test/demo clients only — never real patient records.";

function walkthrough(input: {
  slugKey: string;
  title: string;
  group: "Scheduling" | "Notes" | "Providers";
  summary: string;
  steps: string;
  audienceRole: LearningAudience;
  order: number;
  url: string;
  replaceTitles?: string[];
}): LearningItemSeed {
  return {
    slugKey: input.slugKey,
    title: input.title,
    summary: input.summary,
    body: `${input.group} how-to in PIMSY.

${input.steps}

The interactive Storylane walkthrough is on this card (or Open in a new tab). ${DEMO_CLIENT_NOTE}`,
    kind: "LINK",
    audienceRole: input.audienceRole,
    order: input.order,
    url: input.url,
    isPlaceholder: false,
    replaceTitles: input.replaceTitles,
  };
}

export const LEARNING_CENTER_SECTIONS: LearningSectionSeed[] = [
  {
    slug: "getting-started",
    title: "Getting started",
    description:
      "Intro (text), Getting Started PDF, Overview walkthrough, and tips for a successful implementation.",
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
        title: "Getting started with PIMSY v2",
        summary: "Getting started with PIMSY (Dock PDF).",
        body: `Open the Getting Started PDF on this card for first sign-in, web vs desktop, and where work lives in PIMSY.

See **Password & access** for password reset and the desktop installer. ${DEMO_CLIENT_NOTE}`,
        kind: "LINK",
        audienceRole: "all",
        order: 1,
        url: DOCK_LC_ASSETS.gettingStartedPdf,
        isPlaceholder: false,
        replaceTitles: ["Getting started", "Getting started with PIMSY"],
      },
      {
        slugKey: "overview",
        title: "Overview",
        summary: "Interactive overview of PIMSY — calendar, charts, notes, and the provider dashboard.",
        body: `This Overview walkthrough is the Dock Storylane for PIMSY (calendar, charts, notes, provider dashboard). Play it on this card.

${DEMO_CLIENT_NOTE}`,
        kind: "LINK",
        audienceRole: "all",
        order: 2,
        url: DOCK_LC_ASSETS.overview,
        isPlaceholder: false,
        replaceTitles: ["Finding your way around"],
      },
      {
        slugKey: "tips-successful-implementation",
        title: "Tips for a Successful implementation V2",
        summary: "Tips for a successful PIMSY implementation (Dock PDF).",
        body: `Open the tips PDF on this card. It is the Dock “Tips for a Successful implementation” guide — product and go-live habits in PIMSY, not a PATH project map.`,
        kind: "LINK",
        audienceRole: "all",
        order: 3,
        url: DOCK_LC_ASSETS.tipsPdf,
        isPlaceholder: false,
        replaceTitles: ["Tips for a Successful implementation"],
      },
    ],
  },
  {
    slug: "password-access",
    title: "Password & access",
    description: "Reset a PIMSY password and install or bookmark the EHR.",
    topic: "password_access",
    audienceRole: "all",
    order: 10,
    items: [
      {
        slugKey: "password-reset",
        title: "Password Reset",
        summary: "Reset a PIMSY login — Dock Storylane walkthrough.",
        body: `On the PIMSY sign-in page, use Forgot password. If your practice uses SSO, follow your IT process instead.

Play the Password Reset walkthrough on this card. This implementation portal is a separate login from PIMSY. Do not send passwords in chat or email.`,
        kind: "LINK",
        audienceRole: "all",
        order: 0,
        url: DOCK_LC_ASSETS.passwordReset,
        isPlaceholder: false,
        replaceTitles: ["Password reset"],
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
    description: "PIMSY calendar Storylanes from Dock — named walkthroughs, not unlabeled tiles.",
    topic: "scheduling",
    audienceRole: "clinical",
    order: 20,
    items: [
      walkthrough({
        slugKey: "navigate-calendar",
        title: "How to Navigate the Calendar in the Portal",
        group: "Scheduling",
        summary: "Find the calendar, move between days/weeks, and open an appointment.",
        steps: `In PIMSY:

1. Open the calendar from the appointment widget / schedule view.
2. Move between day, week, and provider views.
3. Open an existing appointment on a demo client.`,
        audienceRole: "clinical",
        order: 0,
        url: DOCK_LC_ASSETS.navigateCalendar,
        replaceTitles: ["Navigate Calendar"],
      }),
      walkthrough({
        slugKey: "recurring-appointments",
        title: "How to Schedule Recurring Appointments in the Portal",
        group: "Scheduling",
        summary: "Set a repeating appointment series on a demo client.",
        steps: `In PIMSY:

1. Create or open a demo appointment.
2. Set the recurrence pattern.
3. Confirm the series on the calendar, then edit or cancel a single occurrence vs. the series as trained.`,
        audienceRole: "clinical",
        order: 1,
        url: DOCK_LC_ASSETS.recurringAppointments,
        replaceTitles: ["Recurring Appointments"],
      }),
      walkthrough({
        slugKey: "telehealth",
        title: "How to Use Telehealth on the Portal",
        group: "Scheduling",
        summary: "Launch a telehealth visit from the appointment (when in scope).",
        steps: `In PIMSY (only if telehealth is in scope):

1. Open a demo telehealth appointment.
2. Use the launch path your specialist shows (client vs. provider).

Skip this card when telehealth is out of scope.`,
        audienceRole: "clinical",
        order: 2,
        url: DOCK_LC_ASSETS.telehealth,
        replaceTitles: ["Telehealth"],
      }),
      walkthrough({
        slugKey: "take-a-payment",
        title: "How to Take a Payment in the Portal",
        group: "Scheduling",
        summary: "Collect a copay / checkout payment in PIMSY.",
        steps: `In PIMSY:

1. Open a demo appointment at checkout.
2. Take the payment the way your specialist demonstrates.
3. Confirm the receipt posts on the demo client.

Do not post card numbers or real patient payment detail in this portal.`,
        audienceRole: "billing",
        order: 3,
        url: DOCK_LC_ASSETS.takeAPayment,
        replaceTitles: ["Take a payment"],
      }),
    ],
  },
  {
    slug: "notes",
    title: "Notes",
    description: "PIMSY note Storylanes from Dock — titled walkthroughs, not a PDF dump.",
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
2. Follow the Ambient Scribe path in the walkthrough.
3. Capture a demo note only — never a real encounter in this portal.`,
        audienceRole: "clinical",
        order: 0,
        url: DOCK_LC_ASSETS.ambientScribe,
      }),
      walkthrough({
        slugKey: "group-note",
        title: "How to do a Group Note",
        group: "Notes",
        summary: "Document a group session in PIMSY when your site uses group notes.",
        steps: `In PIMSY (only if you document group sessions):

1. Open a demo group session.
2. Complete the group note.
3. Record attendance and any individual follow-up notes as trained.`,
        audienceRole: "clinical",
        order: 1,
        url: DOCK_LC_ASSETS.groupNote,
        replaceTitles: ["Group Note"],
      }),
      walkthrough({
        slugKey: "note",
        title: "How to do a Note",
        group: "Notes",
        summary: "Open a progress note template and complete a demo note in PIMSY.",
        steps: `In PIMSY:

1. Open a demo client chart.
2. Start the progress note template.
3. Sign or save as trained. Do not paste real clinical text into this portal.`,
        audienceRole: "clinical",
        order: 2,
        url: DOCK_LC_ASSETS.note,
        replaceTitles: ["Note"],
      }),
      walkthrough({
        slugKey: "favorite-tabs",
        title: "How to Favorite tabs in a Note",
        group: "Notes",
        summary: "Pin the chart tabs you use every day in PIMSY.",
        steps: `In PIMSY:

1. Open a demo client chart.
2. Favorite the tabs for your role.
3. Confirm favorites persist for that training user.`,
        audienceRole: "clinical",
        order: 3,
        url: DOCK_LC_ASSETS.favoriteTabs,
        replaceTitles: ["Favorite tabs"],
      }),
    ],
  },
  {
    slug: "providers",
    title: "Providers",
    description: "Provider dashboard and DrFirst prescriptions in PIMSY — Dock Storylanes.",
    topic: "providers",
    audienceRole: "clinical",
    order: 40,
    items: [
      walkthrough({
        slugKey: "provider-portal-dashboard",
        title: "How to Navigate the Provider Portal Dashboard",
        group: "Providers",
        summary: "What providers see in PIMSY on sign-in: dashboard widgets and next appointments.",
        steps: `In PIMSY:

1. Sign in as a demo provider.
2. Review the Provider Dashboard widgets.
3. Open the appointment widget from the dashboard.`,
        audienceRole: "clinical",
        order: 0,
        url: DOCK_LC_ASSETS.providerDashboard,
        replaceTitles: ["Provider Portal Dashboard"],
      }),
      walkthrough({
        slugKey: "manage-prescriptions-drfirst",
        title: "How to Manage Prescriptions with DrFirst in the Portal",
        group: "Providers",
        summary: "ePrescribe / DrFirst in PIMSY — only if prescribing is in scope.",
        steps: `In PIMSY (only if ePrescribe is in scope):

1. Open the prescriber workspace / queues on a demo patient.
2. Send or manage a demo prescription as trained.

Never send live prescription or patient identifiers in this portal.`,
        audienceRole: "clinical",
        order: 1,
        url: DOCK_LC_ASSETS.managePrescriptions,
        replaceTitles: ["Manage Prescriptions with DrFirst"],
      }),
    ],
  },
  {
    slug: "training",
    title: "Training",
    description:
      "PIMSY product modules in order — client charts, appointments, notes, group notes, intake.",
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

Storylane walkthroughs for calendar, notes, and providers are in those sections.

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

See **Scheduling** and **Providers** for the Dock Storylanes.

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

See **Scheduling** and **Notes** for the Dock Storylanes.

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

See **Notes → How to do a Group Note** for the walkthrough.

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
