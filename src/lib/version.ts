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
export const APP_VERSION = "1.13.8";

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
    version: "1.13.8",
    date: "2026-09-16",
    summary:
      "Dock-parity template expose/hide: new workspaces hide Configuration, Accessing Pimsy, Training, and later tabs until staff expose them; the customer portal and Customer view only show those tabs and link Discovery copy into real tasks.",
    highlights: [
      "Same SHARED / INTERNAL phase column as the portal already used (Dock eyelid). Kickoff + Discovery (and RCM kickoff / payer intake) start customer-visible. Site Configuration, Accessing Pimsy, Training, Billing, import, and later areas start hidden.",
      "Staff task list: Expose tab / Hide tab on each phase (also still on Settings). Completing a Dock “Expose the Configuration / Access / Training tab” reminder flips that live phase to SHARED.",
      "Customer portal: area names and Discovery informational copy link into the real tasks. Action items from a hidden tab do not appear. Staff Customer view has the same area nav so you can switch the tabs the customer can see.",
      "Canonical path playbooks lock after seed/migrate so “not available” junk is not edited into the live template. Duplicate to customize, or Unlock (owner/admin). Re-import: `npm run db:seed -- --templates-only` (replaces playbook rows; live projects keep their tasks). Existing WIP is not auto-hidden — use the eyelid.",
      "Migration `0015_template_locked` (`is_locked` on project_template; template_phase visibility for Dock defaults). PATH + Prism naming unchanged. Out of scope: wizard spreadsheet deep-links, cross-specialist access, auto invite, Billing/RCM connected tasks, HubSpot, multi booking URLs.",
    ],
  },
  {
    version: "1.13.7",
    date: "2026-09-16",
    summary:
      "File library accepts uploaded files and staff-pasted hyperlinks to online forms; both attach to playbook rows and live tasks, and open correctly on staff and portal surfaces.",
    highlights: [
      "Templates → File library: Add Link/Form (paste the real Dock / wizard / questionnaire URL) or Add file. Existing rows stay File vs Link/Form. No invented Storylane or Inbed URLs.",
      "Attach either type to a playbook task (Templates → Edit task) or a live task (Links & files → Attach from library). New workspaces clone both kinds.",
      "Links open the URL in a new tab (and the existing wizard-style popup when the task CTA is a form). Files download or open as before. Portal Links & files no longer treat a form URL as a broken file download.",
      "If a Clinical / Billing / Documentation form CTA has a staff-pasted library LINK, the blue button opens that URL instead of the placeholder sheet. Discovery Wizard is unchanged.",
      "No schema migrate (library_asset / file_asset already have kind FILE | LINK). No playbook resync. Client attachment UI imports labels/hrefs from a client-safe module — not `@/db` or the library server module (same class of webpack/Postgres bug as v1.13.6). Out of scope: live Dock API scrape of form URLs; bulk xlsx ingest.",
    ],
  },
  {
    version: "1.13.6",
    date: "2026-09-16",
    summary:
      "Hotfix: Azure production build no longer fails webpack by bundling Postgres (node:fs / net / tls) into the customer portal task list.",
    highlights: [
      "v1.13.5 portal task list imported pctComplete from the server rollup module, which pulled the Postgres client into the browser bundle. Deploy skipped; live PATH stayed on the previous image.",
      "Percentage helper lives in a client-safe module. The DB client and project-counter refresh are not imported from client components.",
      "No WIP resync. Task list UX from v1.13.5 is unchanged.",
    ],
  },
  {
    version: "1.13.5",
    date: "2026-09-15",
    summary:
      "Staff and portal task lists match Dock for day-to-day work: playbook descriptions on the row, simpler nested checklists, working upload/download, a clear Mark done checkbox, fast filter, and collapsible completed groups.",
    highlights: [
      "Task descriptions resolve from the Dock playbook catalog by title when the live row is blank or still has the old checkbox dump. No live WIP resync required. Optional `npm run db:seed -- --templates-only` persists catalog copy onto playbook rows for new workspaces.",
      "Master list: check the box to complete without opening the task. Nested specialist items stay on the list with less chrome. Training checklists render as checkboxes on the parent — not a separate “areas to cover” card on every task.",
      "Upload files and download → fill → resubmit work from the list (inline upload; file buttons use attached playbook sheets). Server actions accept the same 25 MB limit as storage. Browsers that send application/octet-stream for .xlsx/.pdf are no longer refused.",
      "Task detail: Mark done is at the top. Links & files move up on upload/download tasks. Empty checklist cards are gone.",
      "Filter (All / Open / Done / Customer / Mine) plus a search box. Completed parent groups collapse under “N completed” so finished work is not an infinite scroll.",
      "Portal area lists get the same filter, collapse, descriptions, checkbox, and working actions. PATH + Prism naming unchanged. Out of scope: template expose/hide tabs, wizard spreadsheet deep-links, cross-specialist access, auto invite.",
    ],
  },
  {
    version: "1.13.4",
    date: "2026-09-15",
    summary:
      "Specialists add or remove live tasks and sub-tasks without a Dock-style template editor; customers see kickoff/area content as presentation, with parent status only (not specialist nested checklists).",
    highlights: [
      "Staff project task list: Add task, Add sub-task, and Remove on the live project. Nested specialist work stays on the staff list (internal / yellow). Playbook authoring remains Templates (OWNER/ADMIN) — specialists do not get a free-text workspace template editor.",
      "New sub-tasks default to specialist/internal. The customer portal and staff Customer view show SHARED parent completion (e.g. User Setup done/not) plus customer-owned action items, not Create Users / User Codes style specialist children.",
      "Portal area tabs and Customer view present status, assignee, and in-progress — no editing chrome. Training checklist add/remove stays on Templates; live tasks still check items off.",
      "Removing a live task (and nested sub-tasks) does not change the playbook. No playbook seed/resync in this slice.",
    ],
  },
  {
    version: "1.13.3",
    date: "2026-09-15",
    summary:
      "Forecast+ and Add to roster can skip observed US federal holidays when projecting go-live, so Thanksgiving, Christmas, and New Year’s are not treated as work days.",
    highlights: [
      "Toggle default on: Account for US federal holidays. Off restores Prism-parity calendar math (discovery + 21d config + training, weekends still count).",
      "Holiday set is the standard US federal list on observed dates: New Year’s Day, MLK Day, Washington’s Birthday (Presidents Day), Memorial Day, Juneteenth, Independence Day, Labor Day, Columbus Day / Indigenous Peoples’ Day, Veterans Day, Thanksgiving, Christmas.",
      "The estimator walks the Prism formula days while skipping those holidays (including cascading days that become holidays after a push). Optimistic / Typical / Pessimistic and Add to roster all use the same window.",
      "Even-spread hrs/wk uses the holiday-adjusted kickoff → go-live span. Custom hrs/wk is unchanged.",
      "Preference is stored on the engagement’s Forecast+ scope (`project_scope.skip_us_federal_holidays`, default true). Migration `0014_skip_us_federal_holidays`.",
    ],
  },
  {
    version: "1.13.2",
    date: "2026-09-15",
    summary:
      "Forecast+ staff hours and projected go-live now match standalone Prism Forecast+ for the same scope (config weights + training in the total; discovery + 21d config + training calendar).",
    highlights: [
      "New project, Add to roster, and Edit engagement use Prism Forecast+ weights: 30 min/user, 25 min/form page, org 2h / billing 3h / other 2h, state compliance +2h, minimal org +10h, training 2.5h per session (counted in estimated staff time).",
      "Typical go-live is kickoff + 14d discovery + 21d config + training (8 sessions at 2/week → 30d including the 2-day buffer) = 65 calendar days. Optimistic / Typical / Pessimistic are discovery-responsiveness bands (10 / 14 / 21d), not past-site percentiles.",
      "Past completed sites still appear as a reference caption (P25 / median / P75 after SENSORI / MHC / LECHRIS exclusions). They no longer replace the Forecast+ date — that was why PATH showed ~52d / ~27h while Prism showed 65d / 61.2h on the TEST Implementation.",
      "Playbook template duration (e.g. 32 days) still scales task due dates when you commit a window; it is not the Forecast+ hour or go-live formula.",
      "Re-save an engagement or create a new project to refresh stored estimated hours. Existing roster rows keep their previous hour total until saved.",
    ],
  },
  {
    version: "1.13.1",
    date: "2026-09-15",
    summary:
      "PATH now matches live PWMI Dock task action buttons: blue Click Here / form / Upload files CTAs on Discovery (and the rest of the Implementation template), with the Discovery Wizard opening from Organization Details Form — not only Open/Download chips in Links & files.",
    highlights: [
      "Dock Task Actions (button dependencies) are first-class on the checklist row and the task, staff and portal. Live PWMI labels: Organization Details Form is blue Click Here → https://calm-mud-0fe119810.7.azurestaticapps.net/ (Discovery Wizard popup + Open in new tab). Clinical Workflows is Click Here to Submit Clinical Workflow Form. Billing Questionnaire is Click Here to Submit Billing Questionnaire. Billing spreadsheet, Submit Documents, logos, and letterhead are Upload files. Documentation & Forms is Open form. No invented Storylane or Dock form URLs.",
      "Clinical / Billing / Documentation native Dock forms have no public URL in this repo; PATH shows the Dock label and opens the playbook sheet (or Links & files) until Alexander pastes a URL. RCM intake still Click Here to download. Existing WIP shows the CTA from the task title before resync clones attachments.",
      "Resync backfills missing wizard LINKs, sheets, and PWMI button copy without deleting user uploads or staff notes. Does not call the Dock API. New workspaces inherit the same buttons from the playbook.",
      "Staff and customer portal task lists, phase lists, and task detail all show the CTA.",
      "PATH + Prism naming unchanged. Azure Cloud Shell: npm run db:seed -- --templates-only then npm run db:resync:playbook-from-dock -- --apply.",
    ],
  },
  {
    version: "1.13.0",
    date: "2026-09-15",
    summary:
      "PATH playbook tasks now mirror Dock Implementation: clickable discovery-resource buttons on the task, download → complete → upload copy for customer upload requests, training descriptions, default attachments, and a hang-free Azure resync that backfills existing WIP.",
    highlights: [
      "Discovery Wizard, billing sheets, and other Dock resources show as clickable Open / Download buttons on the live task (staff and portal) — same pattern as Dock, not buried only in description text.",
      "Customer upload-request tasks (billing questionnaire/spreadsheet, org/clinical forms, RCM intake) tell the practice to download the file, complete it, and upload the finished file back on this task. Specialist review tasks stay review-only.",
      "Template extras upsert Dock playbook copy onto matching titles: training descriptions include `- [ ]` areas to cover (plus first-class checklist items), Discovery Wizard as a LINK attachment, billing/clinical/org/RCM sheets. Editor extras and staff-authored descriptions are not wiped.",
      "`npm run db:resync:playbook-from-dock` dry-run then `--apply` backfills existing PATH playbooks (`set-description`, missing checklists, missing default files). Batch-loads extras, logs progress, 180s timeout (`--timeout-sec 0` to disable, `--limit` / `--only` to slice). Azure Cloud Shell: export DATABASE_URL from App Service. Does not call the Dock API or edit live Dock Spaces.",
      "New workspaces inherit those descriptions and attachments from the playbook automatically. Blank or stale training/attachment blurbs are filled; custom specialist notes are left alone. User uploads are never deleted.",
      "Playbook editor still supports Dock-style descriptions, nested tasks, add/remove training areas, and attach/detach library files with Open / Download. Duplicate / optional-areas / hub nav stay available.",
      "PATH + Prism naming unchanged. Live projects are not rewritten when a template changes — run the resync to bring existing WIP into parity.",
    ],
  },
  {
    version: "1.12.4",
    date: "2026-09-14",
    summary:
      "Add to roster projects go-live the way Prism Forecast+ did: Optimistic / Typical / Pessimistic from past completed sites, not a blank date field.",
    highlights: [
      "Prism → Engagements → Add to roster: pick Optimistic / Typical / Pessimistic. Recommended go-live (and even-spread hrs/wk) updates with kickoff, scope, and the selected band.",
      "Go-live bands are P25 / median / P75 of kickoff → actual duration on completed PATH / Prism-imported implementations. Same-tier history is preferred. Primary averages still skip SENSORI / MHC / LECHRIS (editable on Forecast).",
      "Caption explains the sample (e.g. based on N past standard sites) and shows the Forecast+ discovery-model days when history is used. Too few completed rows falls back to the 7 / 14 / 21-day discovery formula.",
      "Edit engagement has the same picker. Applying a scenario fills current go-live; a locked initial go-live still requires a slip if that date moves.",
      "Blank go-live on save now applies the selected scenario instead of storing null.",
    ],
  },
  {
    version: "1.12.3",
    date: "2026-09-14",
    summary:
      "PATH-native Onboarded checkbox hides a site’s overdue / upcoming-due tasks from staff overviews; historical sites with kickoff and go-live can mark remaining tasks complete on time.",
    highlights: [
      "About → Onboarded (staff with project write access: OWNER / ADMIN / MANAGER, and specialists who can already edit About). Default off. Project hub still shows every task; dashboard Needs Attention, My Work, and Portfolio overdue / upcoming-due rollups skip onboarded sites.",
      "PATH-only project flag. Customer portal About is unchanged.",
      "Settings danger zone: Complete historical tasks on time. Requires kickoff + go-live (or actual end) and a gate: COMPLETED, cancelled, archived, post go-live (actual go-live in the past), or Onboarded. Typed confirmation. Active WIP without that gate is refused.",
      "Ops: `npm run db:complete:historical-on-time` (dry-run) / `--apply` / `--project CODE`. Completes open tasks with completedAt on or before the due date, or spread evenly kickoff → go-live when dues are missing.",
      "Migration `0013_onboarded`: boolean `project.onboarded` default false.",
    ],
  },
  {
    version: "1.12.2",
    date: "2026-09-14",
    summary:
      "Dock template task attachments now clone onto matching PATH tasks: Discovery Wizard as a live LINK (not a description URL), billing questionnaire/spreadsheet placeholders, and resync that backfills WIP without deleting user uploads.",
    highlights: [
      "Default attachments are first-class file_asset rows on the task (kind LINK or FILE), copied from the file library when a playbook is materialized — including Dock WIP import, which previously copied titles only.",
      "Discovery Wizard is https://calm-mud-0fe119810.7.azurestaticapps.net/ on Guided Discovery / Workflow Guided Discovery (and Discovery worksheets). It is a clickable attachment, not a URL buried in the task description.",
      "Billing spreadsheet, billing questionnaire, clinical workflows sheet, organization details form, and RCM intake seed as placeholders. Drop real Dock files once in content/template-attachments/ (`npm run db:upload:template-attachments -- --apply`) or replace at Templates → File library. No invented PHI or fake xlsx bytes.",
      "`npm run db:resync:playbook-from-dock -- --apply` attaches missing defaults by task title. User-uploaded files stay. Same URL or library clone is not duplicated.",
      "Templates list/editor show default attachment chips so the playbook is auditable without opening every live site.",
      "Production data: keep **RAC and TANC** on the Dock WIP allowlist until Alexander consolidates. Transformation ANew / Redemption Alliance must not be pruned under either code. Do not auto-rename.",
    ],
  },
  {
    version: "1.12.1",
    date: "2026-09-14",
    summary:
      "Hotfix: Prism Engagements roster fills the content width without a horizontal scrollbar; Slip days is the sum of slip event days; Services is edit-form only.",
    highlights: [
      "Engagements list uses the full main column (no 1180px cap, no empty grey gutter) and a table-fixed grid so acronym, customer, and owners truncate instead of forcing a horizontal scroll at ~1280px+.",
      "Slip days is the total of slip_event.days for that site, not the count of slip events. Zero still shows a dash.",
      "Services is removed from the roster grid. Service-line checkboxes stay on Add to roster and Edit engagement (`/management/engagements/[id]`).",
    ],
  },
  {
    version: "1.12.0",
    date: "2026-09-14",
    summary:
      "Dock Implementation parity: prune only active non-Dock WIP (keep post go-live history), nested playbook resync, default Discovery/billing files, training area checklists, and a customer Learning Center grouped by topic.",
    highlights: [
      "Active-book prune: `npm run db:cleanup:non-dock` (dry-run; `--apply` to delete). Defaults to `content/dock-wip-allowlist.json` — Dock Implementation WIP as of 2026-09-14 (TANC, THS, CEDAR, …). Deletes active / pre-kickoff / pipeline WIP whose acronyms are not on that list. Always keeps completed / post go-live / archived sites for Forecast and Analysis. Dock test/draft spaces (MT Test, Test Dock, DRAFT Impl, …) are excluded unless Alexander allowlists them. Named staff never deleted. `--keep-prism-analytics` keeps pipeline-only extras.",
      "Azure Cloud Shell: copy DATABASE_URL from App Service Configuration (never invent it). Runbook: v1.12-DOCK-PARITY.md and azure/README.md.",
      "In-app delete warns on post go-live / LIVE sites so historical Prism/PATH rows are not wiped by mistake. Prefer archive or the non-Dock script for active WIP.",
      "Playbook nested tasks match the Dock Implementation template (phases → section tasks → subtasks). `npm run db:resync:playbook-from-dock` (dry-run / `--apply`) adds missing children by title without clearing DONE/IN_PROGRESS. Training 1 aliases the Dock combined title used on THS.",
      "Default attachments: Discovery Wizard is the live link https://calm-mud-0fe119810.7.azurestaticapps.net/ on Guided Discovery / Workflow Guided Discovery. Billing questionnaire is submit + upload files; Site Configuration reviews the Billing Questionnaire Data Sheet. Alexander replaces remaining binaries at Templates → File library (Azure Blob / app storage). No Dock credentials in repo.",
      "Training 1 checklists (THS sample, areas to cover): User Profile / Signature Capture, Provider Dashboard, Appointment Widget, Client Management (active, inactive, groups, favorites), Client Create / Term. Storylane walkthroughs attach as a LINK on the task — no guessed Storylane URL. Staff toggle; customers see SHARED items on the portal task.",
      "Customer Learning Center in the portal (`/portal/learn`): topic cards for Intro, Getting Started, Overview, Password Reset, Training Guide, Scheduling, Notes, Providers — searchable, titled, no blank embeds. Staff preview/curate at `/learning`. No PHI.",
    ],
  },
  {
    version: "1.11.3",
    date: "2026-09-14",
    summary:
      "Hotfix: Headroom card is a line chart — weekly billable load vs department capacity — instead of bars.",
    highlights: [
      "Load vs capacity on Staffing, Forecast, and Capacity is an SVG line: weekly billable load as a polyline, department cap as a dashed horizontal.",
      "Peak week is marked with a ring, a dot, and a Peak callout. Near-cap / over-cap coloring stays on the load line and points.",
      "Same data props (`weeks`, `capacityHours`, `peakWeekOf`) and y-scale as v1.11.2 (fixed plot height, +15% head). Week labels still show the day (Sep 14).",
      "No new charting library — inline SVG, same as the rest of the Headroom graphic.",
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
