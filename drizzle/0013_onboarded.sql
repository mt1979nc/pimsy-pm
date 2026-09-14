-- v1.12.3 PATH-native Onboarded flag. Overview overdue / upcoming-due
-- rollups skip these sites; the project hub still shows every task.

ALTER TABLE "project" ADD COLUMN "onboarded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "project_onboarded_idx" ON "project" USING btree ("onboarded");
