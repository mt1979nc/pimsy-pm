CREATE TYPE "public"."asset_kind" AS ENUM('FILE', 'IMAGE', 'LINK');--> statement-breakpoint
CREATE TYPE "public"."customer_status" AS ENUM('PROSPECT', 'ONBOARDING', 'LIVE', 'AT_RISK', 'CHURNED');--> statement-breakpoint
CREATE TYPE "public"."health" AS ENUM('GREEN', 'YELLOW', 'RED');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('TASK_ASSIGNED', 'TASK_DUE_SOON', 'TASK_OVERDUE', 'MESSAGE_POSTED', 'MENTIONED', 'MILESTONE_COMPLETED', 'PROJECT_HEALTH_CHANGED', 'STATUS_UPDATE_PUBLISHED', 'RISK_RAISED', 'TASK_COMMENTED');--> statement-breakpoint
CREATE TYPE "public"."owner_side" AS ENUM('INTERNAL', 'CUSTOMER');--> statement-breakpoint
CREATE TYPE "public"."phase_status" AS ENUM('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT');--> statement-breakpoint
CREATE TYPE "public"."project_member_role" AS ENUM('LEAD', 'CONTRIBUTOR', 'OBSERVER', 'CUSTOMER_CONTACT');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('NOT_STARTED', 'IN_PROGRESS', 'ON_HOLD', 'BLOCKED', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."project_type" AS ENUM('IMPLEMENTATION', 'MIGRATION', 'TRAINING', 'SUPPORT', 'INTERNAL');--> statement-breakpoint
CREATE TYPE "public"."risk_severity" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."risk_status" AS ENUM('OPEN', 'MITIGATING', 'RESOLVED', 'ACCEPTED');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('OWNER', 'ADMIN', 'MANAGER', 'SPECIALIST', 'MEMBER', 'CUSTOMER');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('TODO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'DONE', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('INTERNAL', 'SHARED');--> statement-breakpoint
CREATE TABLE "account" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"summary" text,
	"metadata" jsonb,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_account" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" "customer_status" DEFAULT 'ONBOARDING' NOT NULL,
	"practice_type" text,
	"seat_count" integer,
	"prior_system" text,
	"website" text,
	"phone" text,
	"address_line1" text,
	"address_line2" text,
	"city" text,
	"state" text,
	"postal_code" text,
	"internal_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "file_asset" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" "asset_kind" DEFAULT 'FILE' NOT NULL,
	"url" text,
	"storage_key" text,
	"description" text,
	"mime_type" text,
	"size_bytes" integer,
	"visibility" "visibility" DEFAULT 'INTERNAL' NOT NULL,
	"project_id" text,
	"customer_account_id" text,
	"task_id" text,
	"message_id" text,
	"uploaded_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mention" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_thread" (
	"id" text PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"visibility" "visibility" DEFAULT 'INTERNAL' NOT NULL,
	"project_id" text,
	"customer_account_id" text,
	"created_by_id" text NOT NULL,
	"is_resolved" boolean DEFAULT false NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"parent_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "milestone" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"due_date" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"visibility" "visibility" DEFAULT 'SHARED' NOT NULL,
	"is_go_live" boolean DEFAULT false NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link_url" text,
	"read_at" timestamp with time zone,
	"emailed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_settings" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"staff_defaults" jsonb,
	"customer_defaults" jsonb,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phase" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"order" integer DEFAULT 0 NOT NULL,
	"status" "phase_status" DEFAULT 'NOT_STARTED' NOT NULL,
	"visibility" "visibility" DEFAULT 'SHARED' NOT NULL,
	"start_date" timestamp with time zone,
	"due_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_member" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "project_member_role" DEFAULT 'CONTRIBUTOR' NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_template" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" "project_type" DEFAULT 'IMPLEMENTATION' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"duration_days" integer DEFAULT 60 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"type" "project_type" DEFAULT 'IMPLEMENTATION' NOT NULL,
	"status" "project_status" DEFAULT 'NOT_STARTED' NOT NULL,
	"health" "health" DEFAULT 'GREEN' NOT NULL,
	"customer_account_id" text,
	"lead_id" text,
	"start_date" timestamp with time zone,
	"target_go_live_date" timestamp with time zone,
	"actual_go_live_date" timestamp with time zone,
	"estimated_hours" integer,
	"portal_enabled" boolean DEFAULT true NOT NULL,
	"portal_welcome_message" text,
	"task_count_total" integer DEFAULT 0 NOT NULL,
	"task_count_done" integer DEFAULT 0 NOT NULL,
	"template_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "risk" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"severity" "risk_severity" DEFAULT 'MEDIUM' NOT NULL,
	"status" "risk_status" DEFAULT 'OPEN' NOT NULL,
	"visibility" "visibility" DEFAULT 'INTERNAL' NOT NULL,
	"owner_id" text,
	"due_date" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "status_update" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"author_id" text NOT NULL,
	"summary" text NOT NULL,
	"accomplished" text,
	"upcoming" text,
	"needs_from_you" text,
	"health" "health" DEFAULT 'GREEN' NOT NULL,
	"visibility" "visibility" DEFAULT 'SHARED' NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_comment" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"visibility" "visibility" DEFAULT 'INTERNAL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "task_dependency" (
	"id" text PRIMARY KEY NOT NULL,
	"predecessor_id" text NOT NULL,
	"successor_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"phase_id" text,
	"title" text NOT NULL,
	"description" text,
	"status" "task_status" DEFAULT 'TODO' NOT NULL,
	"priority" "priority" DEFAULT 'MEDIUM' NOT NULL,
	"visibility" "visibility" DEFAULT 'INTERNAL' NOT NULL,
	"owner_side" "owner_side" DEFAULT 'INTERNAL' NOT NULL,
	"assignee_id" text,
	"created_by_id" text,
	"start_date" timestamp with time zone,
	"due_date" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"estimate_hours" real,
	"order" integer DEFAULT 0 NOT NULL,
	"parent_task_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_milestone" (
	"id" text PRIMARY KEY NOT NULL,
	"template_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"order" integer DEFAULT 0 NOT NULL,
	"offset_days" integer DEFAULT 0 NOT NULL,
	"visibility" "visibility" DEFAULT 'SHARED' NOT NULL,
	"is_go_live" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_phase" (
	"id" text PRIMARY KEY NOT NULL,
	"template_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"order" integer DEFAULT 0 NOT NULL,
	"visibility" "visibility" DEFAULT 'SHARED' NOT NULL,
	"offset_days" integer DEFAULT 0 NOT NULL,
	"duration_days" integer DEFAULT 7 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_task" (
	"id" text PRIMARY KEY NOT NULL,
	"phase_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"order" integer DEFAULT 0 NOT NULL,
	"priority" "priority" DEFAULT 'MEDIUM' NOT NULL,
	"visibility" "visibility" DEFAULT 'INTERNAL' NOT NULL,
	"owner_side" "owner_side" DEFAULT 'INTERNAL' NOT NULL,
	"offset_days" integer DEFAULT 0 NOT NULL,
	"duration_days" integer DEFAULT 1 NOT NULL,
	"estimate_hours" real
);
--> statement-breakpoint
CREATE TABLE "thread_participant" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"user_id" text NOT NULL,
	"last_read_at" timestamp with time zone,
	"is_muted" boolean DEFAULT false NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"project_id" text NOT NULL,
	"task_id" text,
	"minutes" integer NOT NULL,
	"worked_on" timestamp with time zone NOT NULL,
	"note" text,
	"billable" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp with time zone,
	"image" text,
	"role" "role" DEFAULT 'MEMBER' NOT NULL,
	"title" text,
	"phone" text,
	"time_zone" text DEFAULT 'America/Chicago' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"customer_account_id" text,
	"capacity_hours_per_week" integer DEFAULT 30 NOT NULL,
	"notification_prefs" jsonb,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_token" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_token_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_asset" ADD CONSTRAINT "file_asset_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_asset" ADD CONSTRAINT "file_asset_customer_account_id_customer_account_id_fk" FOREIGN KEY ("customer_account_id") REFERENCES "public"."customer_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_asset" ADD CONSTRAINT "file_asset_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_asset" ADD CONSTRAINT "file_asset_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_asset" ADD CONSTRAINT "file_asset_uploaded_by_id_user_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mention" ADD CONSTRAINT "mention_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mention" ADD CONSTRAINT "mention_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_thread" ADD CONSTRAINT "message_thread_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_thread" ADD CONSTRAINT "message_thread_customer_account_id_customer_account_id_fk" FOREIGN KEY ("customer_account_id") REFERENCES "public"."customer_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_thread" ADD CONSTRAINT "message_thread_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_thread_id_message_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."message_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_parent_message_id_message_id_fk" FOREIGN KEY ("parent_message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone" ADD CONSTRAINT "milestone_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phase" ADD CONSTRAINT "phase_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_customer_account_id_customer_account_id_fk" FOREIGN KEY ("customer_account_id") REFERENCES "public"."customer_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_lead_id_user_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_template_id_project_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."project_template"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk" ADD CONSTRAINT "risk_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk" ADD CONSTRAINT "risk_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_update" ADD CONSTRAINT "status_update_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_update" ADD CONSTRAINT "status_update_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comment" ADD CONSTRAINT "task_comment_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comment" ADD CONSTRAINT "task_comment_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependency" ADD CONSTRAINT "task_dependency_predecessor_id_task_id_fk" FOREIGN KEY ("predecessor_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependency" ADD CONSTRAINT "task_dependency_successor_id_task_id_fk" FOREIGN KEY ("successor_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_phase_id_phase_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phase"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_parent_task_id_task_id_fk" FOREIGN KEY ("parent_task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_milestone" ADD CONSTRAINT "template_milestone_template_id_project_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."project_template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_phase" ADD CONSTRAINT "template_phase_template_id_project_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."project_template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_task" ADD CONSTRAINT "template_task_phase_id_template_phase_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."template_phase"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_participant" ADD CONSTRAINT "thread_participant_thread_id_message_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."message_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_participant" ADD CONSTRAINT "thread_participant_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_customer_account_id_customer_account_id_fk" FOREIGN KEY ("customer_account_id") REFERENCES "public"."customer_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_log" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_account_slug_idx" ON "customer_account" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "customer_account_status_idx" ON "customer_account" USING btree ("status");--> statement-breakpoint
CREATE INDEX "file_project_visibility_idx" ON "file_asset" USING btree ("project_id","visibility");--> statement-breakpoint
CREATE INDEX "file_customer_idx" ON "file_asset" USING btree ("customer_account_id");--> statement-breakpoint
CREATE INDEX "file_message_idx" ON "file_asset" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "file_task_idx" ON "file_asset" USING btree ("task_id","visibility");--> statement-breakpoint
CREATE UNIQUE INDEX "mention_unique_idx" ON "mention" USING btree ("message_id","user_id");--> statement-breakpoint
CREATE INDEX "mention_user_idx" ON "mention" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "thread_project_idx" ON "message_thread" USING btree ("project_id","last_message_at");--> statement-breakpoint
CREATE INDEX "thread_customer_idx" ON "message_thread" USING btree ("customer_account_id","last_message_at");--> statement-breakpoint
CREATE INDEX "thread_visibility_idx" ON "message_thread" USING btree ("visibility","last_message_at");--> statement-breakpoint
CREATE INDEX "message_thread_idx" ON "message" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "message_author_idx" ON "message" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "milestone_project_order_idx" ON "milestone" USING btree ("project_id","order");--> statement-breakpoint
CREATE INDEX "milestone_due_idx" ON "milestone" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "notification_user_idx" ON "notification" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "notification_created_idx" ON "notification" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "phase_project_order_idx" ON "phase" USING btree ("project_id","order");--> statement-breakpoint
CREATE UNIQUE INDEX "project_member_unique_idx" ON "project_member" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "project_member_user_idx" ON "project_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "project_template_active_idx" ON "project_template" USING btree ("is_active","type");--> statement-breakpoint
CREATE UNIQUE INDEX "project_code_idx" ON "project" USING btree ("code");--> statement-breakpoint
CREATE INDEX "project_customer_idx" ON "project" USING btree ("customer_account_id");--> statement-breakpoint
CREATE INDEX "project_lead_idx" ON "project" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "project_status_idx" ON "project" USING btree ("status");--> statement-breakpoint
CREATE INDEX "project_health_idx" ON "project" USING btree ("health");--> statement-breakpoint
CREATE INDEX "project_go_live_idx" ON "project" USING btree ("target_go_live_date");--> statement-breakpoint
CREATE INDEX "risk_project_status_idx" ON "risk" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "risk_severity_idx" ON "risk" USING btree ("severity","status");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "status_update_project_idx" ON "status_update" USING btree ("project_id","published_at");--> statement-breakpoint
CREATE INDEX "task_comment_task_idx" ON "task_comment" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "task_dependency_unique_idx" ON "task_dependency" USING btree ("predecessor_id","successor_id");--> statement-breakpoint
CREATE INDEX "task_dependency_successor_idx" ON "task_dependency" USING btree ("successor_id");--> statement-breakpoint
CREATE INDEX "task_project_status_idx" ON "task" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "task_assignee_status_idx" ON "task" USING btree ("assignee_id","status");--> statement-breakpoint
CREATE INDEX "task_due_idx" ON "task" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "task_phase_order_idx" ON "task" USING btree ("phase_id","order");--> statement-breakpoint
CREATE INDEX "task_visibility_idx" ON "task" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "task_owner_side_idx" ON "task" USING btree ("owner_side","status");--> statement-breakpoint
CREATE INDEX "template_milestone_order_idx" ON "template_milestone" USING btree ("template_id","order");--> statement-breakpoint
CREATE INDEX "template_phase_order_idx" ON "template_phase" USING btree ("template_id","order");--> statement-breakpoint
CREATE INDEX "template_task_order_idx" ON "template_task" USING btree ("phase_id","order");--> statement-breakpoint
CREATE UNIQUE INDEX "thread_participant_unique_idx" ON "thread_participant" USING btree ("thread_id","user_id");--> statement-breakpoint
CREATE INDEX "thread_participant_user_idx" ON "thread_participant" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "time_entry_user_idx" ON "time_entry" USING btree ("user_id","worked_on");--> statement-breakpoint
CREATE INDEX "time_entry_project_idx" ON "time_entry" USING btree ("project_id","worked_on");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_idx" ON "user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "user_customer_account_idx" ON "user" USING btree ("customer_account_id");--> statement-breakpoint
CREATE INDEX "user_role_idx" ON "user" USING btree ("role");