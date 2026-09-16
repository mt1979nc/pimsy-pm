-- v1.13.11 Customer Discovery uploads spawn Configuration review tasks.
-- review_required is the specialist "Review required" flag (not a second status).
-- content_hash lets re-uploads of the same file skip duplicate review tasks.

ALTER TABLE "task" ADD COLUMN "review_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "file_asset" ADD COLUMN "content_hash" text;--> statement-breakpoint
CREATE INDEX "task_review_required_idx" ON "task" USING btree ("project_id","review_required","status");--> statement-breakpoint
CREATE INDEX "file_content_hash_idx" ON "file_asset" USING btree ("project_id","content_hash");
