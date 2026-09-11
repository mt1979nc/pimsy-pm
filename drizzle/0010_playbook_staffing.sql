-- v1.9 playbook paths, optional areas, per-project N/A, staffing roles, EHR/RCM tracks.
-- New project_member_role values are ADDed only — existing SPECIALIST / RCM /
-- BILLING_SUPPORT rows stay valid (aliases in src/lib/staffing.ts).
-- Do not SET DEFAULT to a newly added enum value in this same migration.

CREATE TYPE "public"."playbook_path" AS ENUM('EHR', 'EHR_RCM', 'RCM_LEGACY', 'RCM_PRISM');--> statement-breakpoint
CREATE TYPE "public"."work_track" AS ENUM('EHR', 'RCM', 'SHARED');--> statement-breakpoint

ALTER TYPE "public"."project_member_role" ADD VALUE 'IMPLEMENTATION_SPECIALIST';--> statement-breakpoint
ALTER TYPE "public"."project_member_role" ADD VALUE 'T1_BILLING_SUPPORT';--> statement-breakpoint
ALTER TYPE "public"."project_member_role" ADD VALUE 'T2_BILLING_SUPPORT';--> statement-breakpoint
ALTER TYPE "public"."project_member_role" ADD VALUE 'RCM_IMPLEMENTATION_SPECIALIST';--> statement-breakpoint
ALTER TYPE "public"."project_member_role" ADD VALUE 'RCM_MANAGER';--> statement-breakpoint
ALTER TYPE "public"."project_member_role" ADD VALUE 'IMPLEMENTATION_DIRECTOR';--> statement-breakpoint
ALTER TYPE "public"."project_member_role" ADD VALUE 'SUPPORT_DIRECTOR';--> statement-breakpoint

ALTER TABLE "user" ADD COLUMN "staffing_role" "project_member_role";--> statement-breakpoint

ALTER TABLE "project_template" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "project_template" ADD COLUMN "playbook_path" "playbook_path";--> statement-breakpoint
CREATE UNIQUE INDEX "project_template_code_idx" ON "project_template" USING btree ("code");--> statement-breakpoint

ALTER TABLE "template_phase" ADD COLUMN "is_optional" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "template_phase" ADD COLUMN "area_key" text;--> statement-breakpoint
ALTER TABLE "template_phase" ADD COLUMN "work_track" "work_track" DEFAULT 'EHR' NOT NULL;--> statement-breakpoint

ALTER TABLE "template_task" ADD COLUMN "is_optional" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "template_task" ADD COLUMN "area_key" text;--> statement-breakpoint
ALTER TABLE "template_task" ADD COLUMN "default_role" "project_member_role";--> statement-breakpoint
ALTER TABLE "template_task" ADD COLUMN "work_track" "work_track" DEFAULT 'EHR' NOT NULL;--> statement-breakpoint
ALTER TABLE "template_task" ADD COLUMN "overlap_key" text;--> statement-breakpoint

ALTER TABLE "project" ADD COLUMN "playbook_path" "playbook_path";--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "source_project_id" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "rcm_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "rcm_target_go_live_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "rcm_task_count_total" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "rcm_task_count_done" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "ehr_task_count_total" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "ehr_task_count_done" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_source_project_id_project_id_fk" FOREIGN KEY ("source_project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "phase" ADD COLUMN "not_applicable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "phase" ADD COLUMN "work_track" "work_track" DEFAULT 'EHR' NOT NULL;--> statement-breakpoint
ALTER TABLE "phase" ADD COLUMN "area_key" text;--> statement-breakpoint

ALTER TABLE "task" ADD COLUMN "not_applicable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "work_track" "work_track" DEFAULT 'EHR' NOT NULL;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "default_role" "project_member_role";--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "overlap_key" text;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "area_key" text;
