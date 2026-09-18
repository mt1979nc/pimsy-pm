/**
 * In-product copy for Project updates — the weekly snapshot, not a chat.
 *
 * Thursday standing instruction is the staff composer prompt (Morgan Wave 4).
 * Keep it short; tweak the strings here rather than in the form JSX.
 */
export const PROJECT_UPDATES_PURPOSE =
  "A dated health snapshot for the practice (done / next / what we need). Use Messages for conversation and a task comment for one action item.";

export const PROJECT_UPDATES_WHEN =
  "Post when the week’s picture changed, or before a touchpoint — not for every file upload or checklist tick.";

export const PROJECT_UPDATES_VISIBILITY =
  "Shared publishes to the customer portal and can email contacts. Internal is a staff note — customers never see it.";

/** Headline above the Updates composer. Easy to edit without touching layout. */
export const PROJECT_UPDATES_THURSDAY_HEADLINE = "Every Thursday, include:";

/** Scannable bullets (Alexander simplicity bar). */
export const PROJECT_UPDATES_THURSDAY_ITEMS = [
  "Temperature / health of the account",
  "Concerns the site raised",
  "Whether any risks were added",
] as const;

export const PROJECT_UPDATES_DUE_TODAY_LABEL = "Due today";
