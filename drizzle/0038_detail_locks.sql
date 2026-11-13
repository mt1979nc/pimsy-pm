-- Fields edited in PATH stay put on the next Prism import.
-- Existing rows start with an empty list, so nothing is locked until someone edits it.

ALTER TABLE "customer_account" ADD COLUMN IF NOT EXISTS "path_managed_fields" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "path_managed_fields" jsonb DEFAULT '[]'::jsonb NOT NULL;
