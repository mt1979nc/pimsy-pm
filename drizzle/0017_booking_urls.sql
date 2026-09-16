-- v1.14.2 Per-meeting-type booking URLs (PATH).
-- Kickoff still uses the assigned specialist’s personal Zoom page when the
-- project has no kickoff URL. Existing zoom_booking_url copies into kickoff.

ALTER TABLE "user" ADD COLUMN "zoom_booking_url" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "booking_urls" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint

UPDATE "project"
SET "booking_urls" = jsonb_strip_nulls(jsonb_build_object('kickoff', "zoom_booking_url"))
WHERE "zoom_booking_url" IS NOT NULL AND btrim("zoom_booking_url") <> '';
