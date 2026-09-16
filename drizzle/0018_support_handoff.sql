-- v1.14.0 Post go-live Hand off to Support: stamp so completing the task
-- again does not re-email Kori. Status COMPLETED is the out-of-implementation
-- state; this timestamp is the idempotency key for the mailer.

ALTER TABLE "project" ADD COLUMN "support_handoff_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "project_support_handoff_idx" ON "project" USING btree ("support_handoff_at");
