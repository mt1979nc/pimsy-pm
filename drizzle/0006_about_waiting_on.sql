CREATE TYPE "public"."waiting_on" AS ENUM('PIMSY', 'CUSTOMER', 'UNKNOWN');--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "hubspot_deal_url" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "prism_client_id" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "crm_acronym" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "crm_key" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "zoom_booking_url" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "about_notes" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "message_thread" ADD COLUMN "waiting_on" "waiting_on" DEFAULT 'UNKNOWN' NOT NULL;--> statement-breakpoint
ALTER TABLE "message_thread" ADD COLUMN "waiting_on_since" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "thread_waiting_on_idx" ON "message_thread" USING btree ("waiting_on","is_resolved","last_message_at");
