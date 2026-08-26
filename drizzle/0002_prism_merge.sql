CREATE TYPE "public"."complexity_tier" AS ENUM('STANDARD', 'MODERATE', 'HIGH', 'ENTERPRISE');--> statement-breakpoint
CREATE TYPE "public"."discovery_scenario" AS ENUM('OPTIMISTIC', 'TYPICAL', 'PESSIMISTIC');--> statement-breakpoint
CREATE TYPE "public"."slip_cause" AS ENUM('CUSTOMER', 'PIMSY');--> statement-breakpoint
CREATE TABLE "project_scope" (
	"project_id" text PRIMARY KEY NOT NULL,
	"user_count" integer DEFAULT 1 NOT NULL,
	"location_count" integer DEFAULT 1 NOT NULL,
	"form_page_count" integer DEFAULT 25 NOT NULL,
	"trainings_per_week" integer DEFAULT 2 NOT NULL,
	"service_lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"state_compliance" boolean DEFAULT false NOT NULL,
	"minimal_org_structure" boolean DEFAULT false NOT NULL,
	"complexity_tier" "complexity_tier" DEFAULT 'STANDARD' NOT NULL,
	"estimated_hours" real,
	"discovery_scenario" "discovery_scenario" DEFAULT 'TYPICAL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slip_event" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"from_date" timestamp with time zone NOT NULL,
	"to_date" timestamp with time zone NOT NULL,
	"days" integer NOT NULL,
	"cause" "slip_cause",
	"note" text,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "initial_go_live_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_scope" ADD CONSTRAINT "project_scope_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slip_event" ADD CONSTRAINT "slip_event_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slip_event" ADD CONSTRAINT "slip_event_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "slip_event_project_idx" ON "slip_event" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "slip_event_cause_idx" ON "slip_event" USING btree ("cause");