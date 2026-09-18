-- v1.18.3 PATH: edited indicator for project updates and risks.
-- task_comment already has edited_at / deleted_at (0000_init).

ALTER TABLE "status_update" ADD COLUMN "edited_at" timestamp with time zone;
ALTER TABLE "risk" ADD COLUMN "edited_at" timestamp with time zone;
