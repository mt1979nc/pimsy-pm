/**
 * The PIMSY implementation playbook.
 * ---------------------------------------------------------------------------
 * Ported directly from the "Implementation Template" in Dock (the one applied
 * to 32 spaces) on 2026-08-21. Group names, task names and Dock's INTERNAL
 * flags are preserved as-is.
 *
 * Dock carries no scheduling data, so `offsetDays` / `durationDays` here are an
 * inferred ~90-day timeline. These are the numbers to tune first — they drive
 * every generated due date.
 *
 * ownerSide semantics:
 *   INTERNAL  → PIMSY implementation team. Hidden from the portal unless the
 *               task is explicitly marked SHARED.
 *   CUSTOMER  → the practice's action item. Always visible in their portal.
 *
 * In Dock, a row without the INTERNAL badge is customer-facing. Those become
 * either CUSTOMER-owned action items (things the practice must do) or
 * INTERNAL-owned but SHARED tasks (things we do that they should be able to
 * watch, e.g. scheduling a training session).
 */

export type SeedTask = {
  title: string;
  ownerSide: "INTERNAL" | "CUSTOMER";
  visibility?: "INTERNAL" | "SHARED";
  offsetDays?: number;
  durationDays?: number;
  estimateHours?: number;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
};

export type SeedPhase = {
  name: string;
  description?: string;
  visibility: "INTERNAL" | "SHARED";
  offsetDays: number;
  durationDays: number;
  tasks: SeedTask[];
};

const I = (title: string, extra: Partial<SeedTask> = {}): SeedTask => ({
  title,
  ownerSide: "INTERNAL",
  visibility: "INTERNAL",
  ...extra,
});

/** Internal work the customer is allowed to watch. */
const S = (title: string, extra: Partial<SeedTask> = {}): SeedTask => ({
  title,
  ownerSide: "INTERNAL",
  visibility: "SHARED",
  ...extra,
});

/** The practice's own action item. Always shows in the portal. */
const C = (title: string, extra: Partial<SeedTask> = {}): SeedTask => ({
  title,
  ownerSide: "CUSTOMER",
  visibility: "SHARED",
  ...extra,
});

export const IMPLEMENTATION_PHASES: SeedPhase[] = [
  {
    name: "Kickoff",
    description: "Account setup, kickoff call, and confirming the data import path.",
    visibility: "SHARED",
    offsetDays: 0,
    durationDays: 7,
    tasks: [
      I("Pre-Kickoff", { priority: "HIGH" }),
      I("Zendesk Company Setup"),
      I("Inbed Bookings"),
      I("Add Import Link to Task (if applicable)"),
      I("Schedule Kickoff", { priority: "HIGH" }),
      I("During Kickoff", { offsetDays: 3 }),
      S("Dock Overview & Threads", { offsetDays: 3 }),
      I("Confirm Data Import", { offsetDays: 3 }),
      I("Schedule: Workflow Guided Discovery", { offsetDays: 3, priority: "HIGH" }),
      I("Post Kickoff", { offsetDays: 4 }),
      I("Add Kickoff Meeting Link", { offsetDays: 4 }),
      I("Create Import Ticket, Import folder, & link to import tasks", { offsetDays: 4 }),
    ],
  },
  {
    name: "Discovery",
    description: "Everything we need from the practice before configuration can start.",
    visibility: "SHARED",
    offsetDays: 5,
    durationDays: 14,
    tasks: [
      C("Organization Details Form", { priority: "HIGH", durationDays: 7 }),
      C("Clinical Workflows", { priority: "HIGH", durationDays: 7 }),
      C("Documentation & Forms", { durationDays: 10 }),
      C("Submit Documents", { offsetDays: 2, durationDays: 8 }),
      C("Billing Questionnaire", { priority: "HIGH", durationDays: 7 }),
      C("Complete & Upload Billing Spreadsheet — Accepted Payers, Modifiers", {
        priority: "HIGH",
        durationDays: 10,
      }),
      C("Upload Company Logo(s)", { durationDays: 10 }),
      C("Letterhead", { durationDays: 10 }),
    ],
  },
  {
    name: "Site Configuration",
    description: "Org, users, billing rules and forms built out in PIMSY.",
    visibility: "SHARED",
    offsetDays: 14,
    durationDays: 28,
    tasks: [
      I("Guided Discovery Meeting", { priority: "HIGH" }),
      I("Meeting Notes & Recording", { offsetDays: 1 }),
      I("Schedule Weekly Touchpoints", { offsetDays: 1 }),
      I('Expose the "Configuration" tab', { offsetDays: 1 }),

      S("Organization Setup", { offsetDays: 2, durationDays: 5 }),
      I("Org Info", { offsetDays: 2 }),
      I("Division Setup", { offsetDays: 3 }),
      I("Logos", { offsetDays: 3 }),
      I("Business Hours", { offsetDays: 3 }),

      S("User Setup", { offsetDays: 5, durationDays: 5 }),
      I("Create Users", { offsetDays: 5 }),
      I("User Codes / Rates", { offsetDays: 6 }),
      I("Supervision Setup", { offsetDays: 6 }),
      I('Expose "Access" tab', { offsetDays: 7 }),
      I("Add Zendesk Users to Org", { offsetDays: 7 }),

      S("Billing Config", { offsetDays: 8, durationDays: 8 }),
      I("Schedule Billing Workflow Discovery Meeting", { offsetDays: 8, priority: "HIGH" }),
      I("Billing Workflow Discovery Meeting Notes & Recording", { offsetDays: 10 }),
      I("Review Billing Questionnaire Data Sheet", { offsetDays: 10 }),
      I("Billing Code Setup", { offsetDays: 11, durationDays: 3 }),
      I("Payer Setup", { offsetDays: 12, durationDays: 3 }),

      I("Review Clinical Workflow Data Sheet", { offsetDays: 9 }),
      S("Forms: Note Templates", { offsetDays: 12, durationDays: 8 }),
      S("Forms: Intake Assistant", { offsetDays: 14, durationDays: 6 }),
      S("Forms: Client Forms", { offsetDays: 14, durationDays: 6 }),
      S("Forms: Clinical Forms", { offsetDays: 14, durationDays: 6 }),
      I("Move Forms", { offsetDays: 18 }),
      S("Forms: Public Docs/Word Merge", { offsetDays: 16, durationDays: 6 }),
      I("Expose Training Tab for Booking", { offsetDays: 22 }),
    ],
  },
  {
    name: "Demographic Import",
    description: "Client data migrated from the prior system, validated with the practice.",
    visibility: "SHARED",
    offsetDays: 21,
    durationDays: 28,
    tasks: [
      I("Tracking"),
      I("Create Zendesk Ticket and Link here"),
      I("Create Import Folder and add link to 'Submit Import Files' task"),
      C("Submit Import Files", { priority: "HIGH", durationDays: 7 }),
      I("Link Zendesk Ticket", { offsetDays: 7 }),
      S("Cleanup & Mapping", { offsetDays: 8, durationDays: 7 }),
      S("Data Review Meeting", { offsetDays: 15, priority: "HIGH" }),
      I("Final Cleanup", { offsetDays: 17, durationDays: 3 }),
      S("Initial Import", { offsetDays: 20 }),
      C("UAT", { offsetDays: 21, durationDays: 5, priority: "HIGH" }),
      C("Final Data Submission", { offsetDays: 24, priority: "HIGH" }),
      S("Final Data Import", { offsetDays: 26 }),
    ],
  },
  {
    name: "Core (Train the Trainer)",
    description: "The five core training sessions for the practice's trainers.",
    visibility: "SHARED",
    offsetDays: 42,
    durationDays: 21,
    tasks: [
      S("Training 1: Intro to PIMSY", { priority: "HIGH" }),
      C("Schedule Training 1", { priority: "HIGH" }),
      I("Add Date to Training Task Title", { offsetDays: 1 }),
      I("Expose Parking Lot", { offsetDays: 1 }),
      I("Confirm users have logged in (prior to training)", { offsetDays: 2 }),
      S("Training 1 Recording Link", { offsetDays: 3 }),

      S("Training 2: Client Charts", { offsetDays: 4 }),
      C("Schedule Training 2", { offsetDays: 4 }),
      I("Confirm users have logged in (prior to training)", { offsetDays: 5 }),
      S("Training 2 Recording Link", { offsetDays: 6 }),

      S("Training 3: Appointments & Notes", { offsetDays: 8 }),
      C("Schedule Training 3", { offsetDays: 8 }),
      I("Confirm users have logged in (prior to training)", { offsetDays: 9 }),
      S("Training 3 Recording Link", { offsetDays: 10 }),
      I("Paisly Ambient Scribe (self-serve)", { offsetDays: 10 }),

      S("Training 4: Group Notes (if applicable)", { offsetDays: 12 }),
      C("Schedule Training 4", { offsetDays: 12 }),
      S("Training 4 Recording Link", { offsetDays: 14 }),

      S("Training 5: Intake", { offsetDays: 16 }),
      C("Schedule Training 5", { offsetDays: 16 }),
      I("Confirm users have logged in (prior to training)", { offsetDays: 17 }),
      S("Training 5 Recording Link", { offsetDays: 18 }),
    ],
  },
  {
    name: "ePrescribe",
    description: "DrFirst site account, prescriber ID proofing, EPCS and PDMP.",
    visibility: "SHARED",
    offsetDays: 35,
    durationDays: 30,
    tasks: [
      I("Configuration"),
      I("Create Site Account"),
      I("Add Users", { offsetDays: 2 }),
      I("Create DrFirst Ticket", { offsetDays: 2 }),
      S("ePrescribe Admin Setup", { offsetDays: 4, durationDays: 14 }),
      C("Send IDP invite (non-EPCS) or EPCS Gold invite to prescribers", {
        offsetDays: 4,
        durationDays: 7,
        priority: "HIGH",
      }),
      C("Prescriber ID proofing", { offsetDays: 8, durationDays: 10, priority: "HIGH" }),
      C("Initiate LAC Process", { offsetDays: 12, durationDays: 7 }),
      C("PDMP Setup (if applicable)", { offsetDays: 14, durationDays: 7 }),
      I("Dr. First Ticket (cc site POC)", { offsetDays: 14 }),
      C("Submit signup info to the state via the DrFirst bamboo link", {
        offsetDays: 16,
        durationDays: 7,
      }),
      S("Training: Complex Clinical (ePrescribe)", { offsetDays: 22 }),
      C("Schedule ePrescribe training", { offsetDays: 22 }),
      S("Training 6 Recording Link", { offsetDays: 25 }),
    ],
  },
  {
    name: "Inpatient / MAT",
    description: "Bed management, eMAR, inventory, messaging, eFax, labs and EVV.",
    visibility: "SHARED",
    offsetDays: 49,
    durationDays: 21,
    tasks: [
      S("Bed Management"),
      S("Bed Management Training Link"),
      S("eMAR", { offsetDays: 3 }),
      S("eMAR Training Link", { offsetDays: 3 }),
      S("Inventory Management", { offsetDays: 6 }),
      S("Inventory Management Training Link", { offsetDays: 6 }),
      S("Messaging", { offsetDays: 8 }),
      I("Messaging config", { offsetDays: 8 }),
      S("eFax Training", { offsetDays: 10 }),
      S("Self-Serve: How to Send Fax in Desktop", { offsetDays: 10 }),
      I("eFax config", { offsetDays: 10 }),
      S("Labs Training", { offsetDays: 12 }),
      I("Labs config", { offsetDays: 12 }),
      S("EVV Training", { offsetDays: 14 }),
      I("EVV config", { offsetDays: 14 }),
    ],
  },
  {
    name: "End-User Training Prep",
    description: "Getting the practice ready to train its own staff.",
    visibility: "SHARED",
    offsetDays: 63,
    durationDays: 10,
    tasks: [
      C("Clinical End-User Training Prep", { priority: "HIGH", durationDays: 7 }),
      C("Admin End-User Training Prep", { priority: "HIGH", durationDays: 7 }),
    ],
  },
  {
    name: "Billing",
    description: "ClaimMD enrollment plus the billing and payroll training track.",
    visibility: "SHARED",
    offsetDays: 56,
    durationDays: 28,
    tasks: [
      C("ClaimMD Enrollment", { priority: "HIGH", durationDays: 14 }),
      I("Account & access verification", { offsetDays: 14 }),
      S("Billing Training 1: Codes & Rates", { offsetDays: 7 }),
      S("Billing Training 1 Recording Link", { offsetDays: 8 }),
      S("Billing Training 2: Authorizations", { offsetDays: 12 }),
      S("Auth Training 1 Recording Link", { offsetDays: 13 }),
      S("Billing Training 3: Intro to Invoicing", { offsetDays: 17 }),
      S("Billing Training 3 Recording Link", { offsetDays: 18 }),
      S("Payroll Training 1 (1 week before go-live)", { offsetDays: 21, priority: "HIGH" }),
      S("Payroll Training 1 Recording Link", { offsetDays: 22 }),
    ],
  },
  {
    name: "Go-Live Checklist",
    description: "The gate. Every line must be true before the practice goes live.",
    visibility: "SHARED",
    offsetDays: 82,
    durationDays: 7,
    tasks: [
      C(
        "Clinical staff are trained on scheduling, client entry, diagnoses, treatment planning, and documentation",
        { priority: "URGENT" },
      ),
      C("All scheduling staff are trained on scheduling, client entry, and payments", {
        priority: "URGENT",
      }),
      C("All appointments are set up for the coming day(s)", { priority: "URGENT" }),
      C("Client portal access has been configured", { priority: "HIGH" }),
      C("Your website is updated for Client Portal and/or Intake Assistant", { priority: "HIGH" }),
      C("If applicable: client import has been completed & validated", { priority: "HIGH" }),
      C("If applicable: credit card configuration completed to accept patient payments"),
      C("If applicable: appointment reminders are configured and activated"),
      C("If applicable: eRX has been configured and accounts set up"),
      C("If applicable: telehealth appointments set up for providers + clients"),
    ],
  },
  {
    name: "Post Go-Live (Tier 2)",
    description: "Second-tier billing, payroll and payment training after go-live.",
    visibility: "SHARED",
    offsetDays: 90,
    durationDays: 30,
    tasks: [
      S("Billing Training 4 (Post Go-Live): Tier 2", { offsetDays: 7 }),
      S("Billing Training 4 Recording Link", { offsetDays: 8 }),
      S("Billing Training 5 (Post Go-Live): Tier 2", { offsetDays: 14 }),
      S("Billing Training 5 Recording Link", { offsetDays: 15 }),
      S("Payroll Training 2: Tier 2", { offsetDays: 21 }),
      S("Payroll Training 2 Recording Link", { offsetDays: 22 }),
      S("Client Payment Training: Tier 2", { offsetDays: 26 }),
      S("Client Payment Training Recording Link", { offsetDays: 27 }),
    ],
  },
  {
    name: "Post Go-Live Survey",
    description: "Closing the loop on the engagement.",
    visibility: "SHARED",
    offsetDays: 97,
    durationDays: 14,
    tasks: [C("Please complete this post go-live survey")],
  },
];

export const IMPLEMENTATION_MILESTONES = [
  { name: "Kickoff call complete", offsetDays: 5, visibility: "SHARED" as const, isGoLive: false },
  { name: "Discovery materials received", offsetDays: 19, visibility: "SHARED" as const, isGoLive: false },
  { name: "Site configuration complete", offsetDays: 42, visibility: "SHARED" as const, isGoLive: false },
  { name: "Data import validated", offsetDays: 49, visibility: "SHARED" as const, isGoLive: false },
  { name: "Core training complete", offsetDays: 63, visibility: "SHARED" as const, isGoLive: false },
  { name: "Go-live readiness sign-off", offsetDays: 88, visibility: "SHARED" as const, isGoLive: false },
  { name: "Go-Live", offsetDays: 90, visibility: "SHARED" as const, isGoLive: true },
  { name: "Tier 2 training complete", offsetDays: 120, visibility: "SHARED" as const, isGoLive: false },
];

export const IMPLEMENTATION_TEMPLATE = {
  name: "PIMSY Implementation",
  description:
    "The standard PIMSY EHR go-live playbook, ported from Dock. Kickoff through post-go-live Tier 2 training, with customer action items surfaced in the portal.",
  type: "IMPLEMENTATION" as const,
  durationDays: 90,
  phases: IMPLEMENTATION_PHASES,
  milestones: IMPLEMENTATION_MILESTONES,
};

/** Lighter-weight template for existing customers adding RCM services. */
export const RCM_TEMPLATE = {
  name: "RCM (Existing Customer)",
  description:
    "Revenue cycle management onboarding for a practice already live on PIMSY.",
  type: "SUPPORT" as const,
  durationDays: 45,
  phases: [
    {
      name: "RCM Kickoff",
      visibility: "SHARED" as const,
      offsetDays: 0,
      durationDays: 7,
      tasks: [
        I("Create RCM Zendesk ticket"),
        I("Schedule RCM kickoff", { priority: "HIGH" }),
        C("Complete RCM intake questionnaire", { priority: "HIGH", durationDays: 7 }),
      ],
    },
    {
      name: "Payer & Enrollment",
      visibility: "SHARED" as const,
      offsetDays: 7,
      durationDays: 21,
      tasks: [
        C("Provide payer list and contracts", { priority: "HIGH", durationDays: 10 }),
        I("Payer setup and validation", { offsetDays: 10, durationDays: 7 }),
        C("ClaimMD enrollment", { offsetDays: 5, durationDays: 14, priority: "HIGH" }),
        I("EDI/ERA enrollment tracking", { offsetDays: 12, durationDays: 10 }),
      ],
    },
    {
      name: "Workflow & Handoff",
      visibility: "SHARED" as const,
      offsetDays: 28,
      durationDays: 17,
      tasks: [
        S("Billing workflow walkthrough", { priority: "HIGH" }),
        I("Claims scrubbing rules configured", { offsetDays: 3 }),
        S("First claims batch review", { offsetDays: 7, priority: "HIGH" }),
        C("Confirm go-forward billing responsibilities", { offsetDays: 10 }),
      ],
    },
  ],
  milestones: [
    { name: "RCM kickoff complete", offsetDays: 7, visibility: "SHARED" as const, isGoLive: false },
    { name: "Payer enrollment complete", offsetDays: 28, visibility: "SHARED" as const, isGoLive: false },
    { name: "First clean claim submitted", offsetDays: 40, visibility: "SHARED" as const, isGoLive: true },
  ],
};
