-- v1.14.0 Training calendar slot + agenda carry-forward.
-- Booked session time is task.session_at (not playbook start/due).
-- Incomplete training-agenda checkboxes copy onto the next session.

ALTER TABLE "task" ADD COLUMN "session_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "task_session_at_idx" ON "task" USING btree ("session_at");--> statement-breakpoint
ALTER TABLE "task_checklist_item" ADD COLUMN "carried_from_task_id" text;--> statement-breakpoint
ALTER TABLE "task_checklist_item" ADD CONSTRAINT "task_checklist_item_carried_from_task_id_task_id_fk" FOREIGN KEY ("carried_from_task_id") REFERENCES "public"."task"("id") ON DELETE set null ON UPDATE no action;
