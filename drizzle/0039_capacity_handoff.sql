-- Optional date that removes a site from Team capacity tiles.
-- Distinct from support_handoff_at (the playbook Hand off to Support stamp).
-- Null on every existing row, so nothing leaves the tiles until a date is saved.

ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "capacity_handoff_on" timestamp with time zone;
