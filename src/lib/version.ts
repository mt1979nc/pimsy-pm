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
export const APP_VERSION = "1.12.0";

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
    version: "1.12.0",
    date: "2026-09-14",
    summary:
      "Dock Implementation parity: prune only active non-Dock WIP (keep post go-live history), nested playbook resync, default Discovery/billing files, training area checklists, and a customer Learning Center grouped by topic.",
    highlights: [
      "Active-book prune: `npm run db:cleanup:non-dock -- <allowlist.json|csv>` (dry-run; `--apply` to delete). Deletes active / pre-kickoff / pipeline WIP whose acronyms are not on the Dock WIP allowlist you pass in. Always keeps completed / post go-live / archived sites for Forecast and Analysis. Named staff never deleted. `--keep-prism-analytics` keeps pipeline-only extras. Do not invent the live Dock list — parent supplies it after scrape.",
      "Azure Cloud Shell: copy DATABASE_URL from App Service Configuration (never invent it). Runbook: v1.12-DOCK-PARITY.md and azure/README.md.",
      "In-app delete warns on post go-live / LIVE sites so historical Prism/PATH rows are not wiped by mistake. Prefer archive or the non-Dock script for active WIP.",
      "Playbook nested tasks match the Dock Implementation template (phases → section tasks → subtasks). `npm run db:resync:playbook-from-dock` (dry-run / `--apply`) adds missing children by title without clearing DONE/IN_PROGRESS.",
      "Default attachments (Discovery Wizard, billing spreadsheet, billing questionnaire, clinical workflows, org details) seed as placeholders in the file library and auto-attach on new workspaces. Alexander replaces binaries at Templates → File library (Azure Blob / app storage). No Dock credentials in repo.",
      "Training tasks have first-class area-to-cover checkboxes (editable, per-item done). Staff toggle; customers see SHARED items on the portal task (Dock-style visibility). Seed from Dock training session titles; paste a scraped `- [ ]` description later via parseChecklistFromDescription.",
      "Customer Learning Center in the portal (`/portal/learn`): grouped by Getting started, Discovery, Training, Billing, Go-live, After go-live; searchable; role chips. Staff preview/curate at `/learning`. Placeholders until recordings/files are uploaded. No PHI.",
    ],
  },
  {
    version: "1.11.2",
    date: "2026-09-14",
    summary:
      "Hotfix: Forecast Headroom chart draws weekly load bars; team member cards show this-week / peak vs capacity; owners/admins/managers can delete a project or customer with typed confirmation.",
    highlights: [
      "Headroom bars use pixel heights on a fixed 160px track. Percentage heights inside a flex `items-end` row had collapsed to 0px (only the peak-week ring remained), which matched Alexander’s blank chart on live PATH.",
      "Team load cards always list rostered people with this-week hours, peak hours, and declared cap — same mapping on Staffing, Forecast, Team, and Capacity.",
      "Week labels keep the day (Sep 14) so the horizon is readable.",
      "Danger zone: delete project from project settings (type acronym or name). Deletes tasks, threads, slips, memberships, files via existing FK cascades. Archive remains for hiding without delete.",
      "Delete customer from the customer page (type name). Refuses if staff users are linked. Remaining projects require the “Also delete projects” checkbox. Portal contacts may be removed; named staff logins are never deleted.",
    ],
  },
  {
    version: "1.11.1",
    date: "2026-09-14",
    summary:
      "Hotfix: Portfolio and Waiting-on are separate working views again; demo/test clients and users can be removed from the live book; Prism Capacity/Forecast/Analysis charts and member cards for daily use.",
    highlights: [
      "Leadership → Portfolio is the delivery health report again (`/reports`). Waiting on is `/reports/waiting-on` (open SHARED threads). Prefix-matching no longer treats every /reports/* page as Portfolio.",
      "Idempotent cleanup: `npm run db:cleanup:demo` (dry-run) / `--apply`. Removes Riverbend/IMP-9001, other seed customers, demo.manager / demo.specialist, @example.com fixtures, GROK E2E / IMP-0004. Never touches named staff, playbooks, or imported WIP (BDMH, BHC, CCCCARE, CEDAR, …).",
      "Prism hub, Forecast, Team, Capacity, and Analysis now show headroom graphics, member load cards, and on-time rate bars — same forecast math, closer to standalone Prism.",
      "Seed default is templates-only. Local Nathan fixtures need `npm run db:seed -- --with-demo`. Live PATH should not re-seed demo logins.",
    ],
  },
  {
    version: "1.11.0",
    date: "2026-09-14",
    summary:
      "PATH is the Dock replacement; Prism (capacity, forecast, analysis) lives inside PATH. Standalone nice-rock is retired as the book of business. One-time Prism SQL/JSON import, Director/Pipeline morning snapshot API, add-to-roster, pipeline filter. No ongoing Prism SQL dual-write.",
    highlights: [
      "Product name: PATH (Plan · Assign · Track · Handoff). Prism stays the analytics module (Portfolio · Readiness · Insight · Staffing · Metrics) — sidebar section, Forecast, Analysis, Staffing hub.",
      "Staffing hub is the morning snapshot: this-week load, peak/hire-now, go-lives next 14 days, slips, pipeline.",
      "Add to roster (Forecast+ scope + Prism status) without waiting on a playbook; pipeline filter on the engagement list.",
      "Analysis now lists forecast vs actual per completed site (SENSORI / MHC / LECHRIS still excluded from primary averages by default).",
      "Kickoff / go-live / slip saves refresh Forecast weekly hours automatically (same even-spread model).",
      "One-time import: npm run db:dump:prism / db:import:prism (JSON dump + Azure Cloud Shell runbook). Idempotent by acronym / prism_team_id; WIP playbooks and demo logins are protected.",
      "Director / Pipeline routines: GET /api/prism/snapshot with PRISM_READ_API_KEY (or a Management session). Do not query Prism Azure SQL after cutover.",
      "Standalone Prism (nice-rock) can go read-only then dark after Alexander confirms the go/no-go checklist in v1.11-PRISM-CUTOVER.md.",
    ],
  },
  {
    version: "1.10.0",
    date: "2026-09-12",
    summary:
      "Management Forecast: weekly hours, peak week, department headroom, hire-now; capacity-exempt staff excluded from dept math; configurable Analysis exclusions (default SENSORI / MHC / LECHRIS). Native Postgres — Prism SQL dual-read is v1.11.",
    highlights: [
      "Staffing → Forecast is the daily Capacity / Forecast+ screen (OWNER / ADMIN / MANAGER only).",
      "Weekly hours from scoped estimates or custom hrs/wk across kickoff → current go-live; pipeline stays off the load.",
      "Peak week, this-week headroom, and a hire-now signal when peak billable load exceeds department capacity.",
      "Go-live slips dilute weekly hours unless the engagement has custom hrs/wk — same estimate, longer window.",
      "Capacity-exempt people still show personal load but are excluded from department headroom and hire-now.",
      "Analysis primary averages exclude SENSORI, MHC, and LECHRIS by default; the list is editable on Forecast.",
      "Forecast+ estimator weights are listed on the Forecast page (service-line hours, minutes, phase days).",
      "Customers never see Forecast. Specialists are redirected from Management. No Prism Azure SQL in this release.",
    ],
  },
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
