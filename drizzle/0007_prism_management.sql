ALTER TABLE "user" ADD COLUMN "capacity_exempt" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "can_lead" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "is_director" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "prism_team_id" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "co_lead_id" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "owner_split_percent" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "custom_hours_per_week" real;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "prism_status" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "prism_note" text;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_co_lead_id_user_id_fk" FOREIGN KEY ("co_lead_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_prism_team_id_idx" ON "user" USING btree ("prism_team_id");--> statement-breakpoint
CREATE INDEX "project_co_lead_idx" ON "project" USING btree ("co_lead_id");--> statement-breakpoint
CREATE INDEX "project_prism_status_idx" ON "project" USING btree ("prism_status");
