-- Team capacity parity: recorded phase on the project, and slip rows that
-- can be saved without moving the go-live date.

ALTER TABLE "project" ADD COLUMN "current_phase" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "phase_recorded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_current_phase_check" CHECK (
  "current_phase" IS NULL
  OR "current_phase" IN ('kickoff', 'discovery', 'config', 'training', 'pregolive', 'complete')
);--> statement-breakpoint
ALTER TABLE "slip_event" ADD COLUMN "go_live_applied" boolean DEFAULT true NOT NULL;
