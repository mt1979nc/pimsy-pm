/**
 * Shown on the sign-in page and printed by START-HERE.bat, so it is possible to
 * tell at a glance which copy of the app is actually running.
 *
 * That mattered once already: a build in which no mutation saved anything
 * looked identical to a working one, because reads were fine. Nothing on screen
 * distinguished them.
 *
 * Bump this AND the "version" field in package.json together.
 */
export const APP_VERSION = "1.6.0";

/** One line per release, newest first. Kept short on purpose. */
export const RELEASE_NOTES: { version: string; date: string; summary: string }[] = [
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
