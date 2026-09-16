-- v1.13.9 Exclude from Prism / portfolio / capacity analytics.
-- E2E and stress-test customers/projects stay in delivery + portal;
-- reporting queries skip them the same way they skip archivedAt.

ALTER TABLE "customer_account" ADD COLUMN "exclude_from_analytics" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "exclude_from_analytics" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "customer_account_exclude_analytics_idx" ON "customer_account" USING btree ("exclude_from_analytics");--> statement-breakpoint
CREATE INDEX "project_exclude_analytics_idx" ON "project" USING btree ("exclude_from_analytics");
