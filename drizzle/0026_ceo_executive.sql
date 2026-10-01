-- v1.18.7 PATH: CEO executive book fields that do not already exist.
-- Go-live dates stay on initial_go_live_date, target_go_live_date, actual_go_live_date.
-- The Dock URL is not stored. The PATH project page replaces Link to Dock.

CREATE TYPE "public"."ceo_status" AS ENUM (
  'NOT_YET_STARTED',
  'PAUSED',
  'IN_PROCESS_ON_TRACK',
  'IN_PROCESS_OFF_TRACK',
  'LIVE'
);--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "contract_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "expected_arr" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "ceo_status" "ceo_status";--> statement-breakpoint
CREATE INDEX "project_ceo_status_idx" ON "project" USING btree ("ceo_status");
