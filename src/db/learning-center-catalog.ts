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
  if (url && isLearningStorylaneUrl(url)) return "Storylane";
  if (url && isLearningPdfUrl(url)) return "PDF";
  const k = kind.toUpperCase();
  if (k === "LINK") return "Link";
  if (k === "FILE") return "File";
  return "Guide";
}

/** Catalog / detail badge when a Dock PDF or Storylane URL is not wired yet. */
export function learningPlaceholderLabel(_kind: string): string {
  return "Pending";
}

/** Short open control — never “View PDF”, never repeats the full title. */
export function learningOpenLabel(title: string, kind = "LINK", url?: string | null): string {
  if (title.toLowerCase().includes("wizard")) return "Open Discovery Wizard";
  if (kind.toUpperCase() === "FILE" || (url && isLearningPdfUrl(url))) return "Open PDF";
  return "Open";
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

function walkthrough(input: {
  slugKey: string;
  title: string;
  summary: string;
  audienceRole: LearningAudience;
  order: number;
  url: string;
  replaceTitles?: string[];
}): LearningItemSeed {
  return {
    slugKey: input.slugKey,
    title: input.title,
    summary: input.summary,
    body: "",
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
        summary: "Charts, calendar, notes, and billing.",
        body: "PIMSY is the EHR. Train on demo/test clients only — never real patient records.",
        kind: "ARTICLE",
        audienceRole: "all",
        order: 0,
        isPlaceholder: false,
        replaceTitles: ["Welcome to your implementation workspace"],
      },
      {
        slugKey: "getting-started",
        title: "Getting started with PIMSY v2",
        summary: "First sign-in, web vs desktop.",
        body: "",
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
        summary: "Calendar, charts, notes, provider dashboard.",
        body: "",
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
        summary: "Go-live habits in PIMSY.",
        body: "",
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
        summary: "Forgot password on the PIMSY sign-in page.",
        body: "",
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
        summary: "Desktop app installer.",
        body: "Install the Windows app, then enter the practice acronym and security key from your specialist.",
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
        summary: "Find the calendar, move between days/weeks, and open an appointment.",
        audienceRole: "clinical",
        order: 0,
        url: DOCK_LC_ASSETS.navigateCalendar,
        replaceTitles: ["Navigate Calendar"],
      }),
      walkthrough({
        slugKey: "recurring-appointments",
        title: "How to Schedule Recurring Appointments in the Portal",
        summary: "Set a repeating appointment series on a demo client.",
        audienceRole: "clinical",
        order: 1,
        url: DOCK_LC_ASSETS.recurringAppointments,
        replaceTitles: ["Recurring Appointments"],
      }),
      walkthrough({
        slugKey: "telehealth",
        title: "How to Use Telehealth on the Portal",
        summary: "Launch a telehealth visit from the appointment (when in scope).",
        audienceRole: "clinical",
        order: 2,
        url: DOCK_LC_ASSETS.telehealth,
        replaceTitles: ["Telehealth"],
      }),
      walkthrough({
        slugKey: "take-a-payment",
        title: "How to Take a Payment in the Portal",
        summary: "Collect a copay / checkout payment in PIMSY.",
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
        summary: "Paisly Ambient Scribe in PIMSY — only if it is in scope.",
        audienceRole: "clinical",
        order: 0,
        url: DOCK_LC_ASSETS.ambientScribe,
      }),
      walkthrough({
        slugKey: "group-note",
        title: "How to do a Group Note",
        summary: "Document a group session in PIMSY when your site uses group notes.",
        audienceRole: "clinical",
        order: 1,
        url: DOCK_LC_ASSETS.groupNote,
        replaceTitles: ["Group Note"],
      }),
      walkthrough({
        slugKey: "note",
        title: "How to do a Note",
        summary: "Open a progress note template and complete a demo note in PIMSY.",
        audienceRole: "clinical",
        order: 2,
        url: DOCK_LC_ASSETS.note,
        replaceTitles: ["Note"],
      }),
      walkthrough({
        slugKey: "favorite-tabs",
        title: "How to Favorite tabs in a Note",
        summary: "Pin the chart tabs you use every day in PIMSY.",
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
        summary: "What providers see in PIMSY on sign-in: dashboard widgets and next appointments.",
        audienceRole: "clinical",
        order: 0,
        url: DOCK_LC_ASSETS.providerDashboard,
        replaceTitles: ["Provider Portal Dashboard"],
      }),
      walkthrough({
        slugKey: "manage-prescriptions-drfirst",
        title: "How to Manage Prescriptions with DrFirst in the Portal",
        summary: "ePrescribe / DrFirst in PIMSY — only if prescribing is in scope.",
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
        summary: "Five PIMSY modules in order. Skip group notes if unused.",
        body: `1. Intro, charts, calendar
2. Client charts
3. Appointments & notes
4. Group notes (if used)
5. Intake`,
        kind: "ARTICLE",
        audienceRole: "all",
        order: 0,
        isPlaceholder: false,
      },
      {
        slugKey: "training-1",
        title: "Training 1: Intro to PIMSY, Client Charts, Appointments/Calendar",
        summary: "Profile, dashboard, appointment widget, clients.",
        body: `- User Profile / Signature Capture
- Provider Dashboard
- Appointment Widget
- Client Management
- Client Create / Term`,
        kind: "ARTICLE",
        audienceRole: "all",
        order: 1,
        isPlaceholder: false,
        replaceTitles: ["Training 1 — Intro to PIMSY"],
      },
      {
        slugKey: "training-2",
        title: "Training 2: Client Charts",
        summary: "Demographics, diagnoses, treatment plans, documents.",
        body: `- Creating a client
- Demographics and contacts
- Diagnoses
- Treatment planning
- Chart documents`,
        kind: "ARTICLE",
        audienceRole: "clinical",
        order: 2,
        isPlaceholder: false,
        replaceTitles: ["Training 2 — Client charts"],
      },
      {
        slugKey: "training-3",
        title: "Training 3: Appointments & Notes",
        summary: "Scheduling, notes, checkout payments.",
        body: `- Scheduling
- Progress notes
- Payments at checkout
- Ambient Scribe (if in scope)`,
        kind: "ARTICLE",
        audienceRole: "clinical",
        order: 3,
        isPlaceholder: false,
        replaceTitles: ["Training 3 — Appointments & notes"],
      },
      {
        slugKey: "training-4",
        title: "Training 4: Group Notes (if applicable)",
        summary: "Group sessions — skip if unused.",
        body: `- Group session setup
- Group notes
- Attendance / follow-up notes`,
        kind: "ARTICLE",
        audienceRole: "clinical",
        order: 4,
        isPlaceholder: false,
      },
      {
        slugKey: "training-5",
        title: "Training 5: Intake",
        summary: "Intake Assistant, inquiry to chart, consents.",
        body: `- Intake Assistant / public forms
- Inquiry to chart
- Consents`,
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
