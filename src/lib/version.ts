/**
 * Shown on the sign-in page and printed by START-HERE.bat, so it is possible to
 * tell at a glance which copy of the app is actually running.
 *
 * That mattered once already: a build in which no mutation saved anything
 * looked identical to a working one, because reads were fine. Nothing on screen
 * distinguished them.
 *
 * Bump this AND the "version" field in package.json together. Then add a
 * newest-first entry to RELEASE_NOTES — staff Update History (`/updates`)
 * reads that list. Do not invent a separate CMS.
 */
export const APP_VERSION = "1.9.1";

export type ReleaseNote = {
  version: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  summary: string;
  /** Optional bullets for the staff Update History page. */
  highlights?: string[];
};

/** One entry per release, newest first. Staff-only `/updates` is fed by this. */
export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "1.9.1",
    date: "2026-09-12",
    summary:
      "Hotfix: playbook editor shows newly added phases/tasks without remount; project-settings invite keeps a copyable link; Resend failure still returns the invite URL; duplicate RCM attach is rejected; director/manager roles default to Not assigned on create.",
    highlights: [
      "Playbook editor syncs phase/task order with the latest template so add no longer vanishes until remount.",
      "Project settings invite shows a copyable invite URL after success, matching the customer-page form.",
      "If Resend fails after the invite token is minted, staff still get `{ ok, inviteUrl, emailSkipped: true }`.",
      "Attaching RCM (path 4 / addRcmTrackToProject) is rejected when the project is already RCM_PRISM or has RCM tasks.",
      "New-site staffing: director/manager roles default to Not assigned; only Implementation Specialist (and T1/RCM specialist when already the pattern) auto-suggest.",
    ],
  },
  {
    version: "1.9.0",
    date: "2026-09-11",
    summary:
      "Editable playbooks (add/remove + drag-reorder phases and tasks); four site paths (EHR, EHR+RCM, RCM Legacy, Existing EHR+RCM/Prism); optional areas on create; per-project N/A; staffing roles with auto-assign and manager overview cards; staff-only Update History.",
    highlights: [
      "Templates are fully editable: add/remove tasks and phases, drag-and-drop reorder both.",
      "Four site paths: EHR only, EHR + RCM, Existing EHR + RCM Legacy (no Prism), Existing EHR + RCM (Prism data).",
      "Optional areas on create (import, ePrescribe, Inpatient/MAT, group notes, payroll).",
      "Per-project N/A on a task or a whole section — does not change the template.",
      "Staffing roles with auto-assign; managers/directors get a site overview card; task assignee stays editable.",
      "Staff-only Update History (`What's new`) so the team can see what shipped. Customers never see it.",
    ],
  },
  {
    version: "1.8.4",
    date: "2026-09-11",
    summary:
      "Needs Attention shows bold site acronym (hover full name); invite form layout fix + always-copyable invite link (Resend when keyed); project slip history with delete/cascade revert; staff Customer view preview mirroring portal.",
  },
  {
    version: "1.8.3",
    date: "2026-09-11",
    summary:
      "Staff logins (Alexander OWNER / Morgan specialist) with must-change password; Dock WIP import (15 sites, no contact invites); My Work grouped by customer→phase; lead pickers respect canLead (directors included).",
  },
  {
    version: "1.8.2",
    date: "2026-09-11",
    summary:
      "Fix slip +N days ignored when form default targetGoLiveDate round-trips ±1 day (UTC midnight vs noon / CT); slipDays now wins over same-form date noise.",
  },
  {
    version: "1.8.1",
    date: "2026-09-11",
    summary:
      "Timeline auto-schedule from Prism kickoff→go-live (create + management cascade); slips must push go-live (+days or new date) then rescale open work; Dock-style project roles SPECIALIST/RCM/BILLING_SUPPORT + Outlook staff seed.",
  },
  {
    version: "1.8.0",
    date: "2026-09-10",
    summary:
      "Management staffing + engagement edit (Prism manual parity); team flags (exempt/canLead/director); native Postgres — no Prism Azure SQL dual-write.",
  },
  {
    version: "1.7.0",
    date: "2026-09-10",
    summary:
      "About/site profile (staff edit + portal read-only); waiting-on threads with aging and portfolio WIP rollup; ROADMAP.md for Nathan/Dock replacement.",
  },
  {
    version: "1.6.4",
    date: "2026-09-10",
    summary:
      "Readable primary buttons (fixed global CSS color inherit); portal side Areas nav; tasks grouped by phase; timeline top with messages beside task list.",
  },
  {
    version: "1.6.3",
    date: "2026-09-10",
    summary:
      "Hide New project CTAs for specialists on dashboard and customer pages (create was already server-blocked).",
  },
  {
    version: "1.6.2",
    date: "2026-09-10",
    summary:
      "Specialists cannot create customers/projects; Dock section/subtask nesting; high-contrast primary buttons; portal task comment flags + persistent message box on the customer home screen.",
  },
  {
    version: "1.6.1",
    date: "2026-09-10",
    summary:
      "Nathan demo readiness: password-ready Management/Specialist/Customer logins, DEMO.md walkthrough, AA contrast fix for muted text, slightly larger base type, clearer sign-in version.",
  },
  {
    version: "1.6.0",
    date: "2026-08-26",
    summary:
      "Adds email+password sign-in and 'forgot password' recovery alongside magic links, plus everything needed to run this app on Azure (Docker image, Azure Blob file storage, and a one-command infrastructure setup).",
  },
  {
    version: "1.5.0",
    date: "2026-08-26",
    summary:
      "Applies the official PIMSY brand colors and logo throughout the app, sign-in page, and emails, replacing the placeholder blue and letter mark.",
  },
  {
    version: "1.4.0",
    date: "2026-08-26",
    summary:
      "Specialists now only see projects they're assigned to, not the whole portfolio. Templates moved to Owner/Admin only.",
  },
  {
    version: "1.3.0",
    date: "2026-08-25",
    summary:
      "Customer portal redesigned around tabs, one per phase, with per-phase visibility toggles and a new Recordings tab.",
  },
  {
    version: "1.2.0",
    date: "2026-08-25",
    summary:
      "Folds PRISM's scoping estimator, go-live forecasting, and analysis reporting into project creation, plus a one-time import of PRISM's historical book of business.",
  },
  {
    version: "1.1.0",
    date: "2026-08-24",
    summary:
      "Fixes a bug where nothing you changed was saved on the embedded database. Adds task-completion and attachment alerts, Outlook-ready email, and an optional Microsoft Teams feed.",
  },
  { version: "1.0.0", date: "2026-08-21", summary: "First build." },
];

/** Newest release — must match APP_VERSION. */
export function currentRelease(): ReleaseNote {
  const note = RELEASE_NOTES[0];
  if (!note) {
    throw new Error("RELEASE_NOTES is empty — add an entry when bumping APP_VERSION.");
  }
  return note;
}

/** Staff Update History source. Newest first. Customers never receive this list. */
export function staffUpdateHistory(): ReleaseNote[] {
  return RELEASE_NOTES;
}
