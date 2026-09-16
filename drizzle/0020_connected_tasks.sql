-- v1.14.0 Connected billing tasks + Billing Configuration team area.
-- Live connectKey lets completing a Discovery/Configuration copy reflect on
-- the Billing Configuration (or RCM) copy. Templates-only seed + playbook
-- resync stamp keys and insert the new tab; this migrate only adds columns.

ALTER TABLE "template_task" ADD COLUMN "connect_key" text;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "connect_key" text;--> statement-breakpoint
CREATE INDEX "task_project_connect_idx" ON "task" USING btree ("project_id", "connect_key");
