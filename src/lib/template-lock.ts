/**
 * Canonical Dock playbooks can be locked so “not available” junk is not
 * edited into the live path templates. Duplicate to customize. Re-import
 * with `npm run db:seed -- --templates-only` (replaces playbook rows only;
 * live projects keep their materialized tasks).
 */

export const TEMPLATE_LOCKED_MESSAGE =
  "This Dock playbook is locked. Duplicate it to customize, or unlock (owner/admin) if you must edit. Re-import: npm run db:seed -- --templates-only (replaces the playbook; live projects keep their rows).";
