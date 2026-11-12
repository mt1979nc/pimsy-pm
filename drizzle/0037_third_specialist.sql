-- Optional 3rd specialist and a percent for each assigned owner.
-- Existing lead + co-lead rows: primary keeps owner_split_percent, co-lead
-- gets the rest, 3rd specialist is empty. A sole owner becomes 100.

ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "third_specialist_id" text;
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "lead_split_percent" integer DEFAULT 100 NOT NULL;
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "co_lead_split_percent" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "third_split_percent" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "project" ADD CONSTRAINT "project_third_specialist_id_user_id_fk" FOREIGN KEY ("third_specialist_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_third_specialist_idx" ON "project" USING btree ("third_specialist_id");
--> statement-breakpoint
UPDATE "project" SET
  "lead_split_percent" = CASE WHEN "co_lead_id" IS NOT NULL THEN "owner_split_percent" ELSE 100 END,
  "co_lead_split_percent" = CASE WHEN "co_lead_id" IS NOT NULL THEN GREATEST(0, 100 - "owner_split_percent") ELSE 0 END,
  "third_split_percent" = 0,
  "owner_split_percent" = CASE WHEN "co_lead_id" IS NOT NULL THEN "owner_split_percent" ELSE 100 END;
