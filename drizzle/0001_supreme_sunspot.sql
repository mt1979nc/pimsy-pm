ALTER TYPE "public"."notification_type" ADD VALUE 'TASK_COMPLETED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'FILE_UPLOADED';--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "teams_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "teams_webhook_url" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "teams_webhook_url" text;