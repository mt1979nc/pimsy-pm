-- v1.12 Dock parity: nested-task checklists, reusable playbook files,
-- customer Learning Center. Native Postgres only.

CREATE TABLE "library_asset" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" "asset_kind" DEFAULT 'FILE' NOT NULL,
	"url" text,
	"storage_key" text,
	"mime_type" text,
	"size_bytes" integer,
	"visibility" "visibility" DEFAULT 'SHARED' NOT NULL,
	"is_placeholder" boolean DEFAULT true NOT NULL,
	"admin_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "library_asset_slug_idx" ON "library_asset" USING btree ("slug");--> statement-breakpoint

CREATE TABLE "template_task_checklist_item" (
	"id" text PRIMARY KEY NOT NULL,
	"template_task_id" text NOT NULL,
	"label" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"visibility" "visibility" DEFAULT 'SHARED' NOT NULL
);--> statement-breakpoint
ALTER TABLE "template_task_checklist_item" ADD CONSTRAINT "template_task_checklist_item_template_task_id_template_task_id_fk" FOREIGN KEY ("template_task_id") REFERENCES "public"."template_task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "template_task_checklist_idx" ON "template_task_checklist_item" USING btree ("template_task_id","order");--> statement-breakpoint

CREATE TABLE "template_task_attachment" (
	"id" text PRIMARY KEY NOT NULL,
	"template_task_id" text NOT NULL,
	"library_asset_id" text NOT NULL
);--> statement-breakpoint
ALTER TABLE "template_task_attachment" ADD CONSTRAINT "template_task_attachment_template_task_id_template_task_id_fk" FOREIGN KEY ("template_task_id") REFERENCES "public"."template_task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_task_attachment" ADD CONSTRAINT "template_task_attachment_library_asset_id_library_asset_id_fk" FOREIGN KEY ("library_asset_id") REFERENCES "public"."library_asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "template_task_attachment_unique_idx" ON "template_task_attachment" USING btree ("template_task_id","library_asset_id");--> statement-breakpoint

CREATE TABLE "task_checklist_item" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"label" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"visibility" "visibility" DEFAULT 'SHARED' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "task_checklist_item" ADD CONSTRAINT "task_checklist_item_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_checklist_task_idx" ON "task_checklist_item" USING btree ("task_id","order");--> statement-breakpoint

ALTER TABLE "file_asset" ADD COLUMN "library_asset_id" text;--> statement-breakpoint
ALTER TABLE "file_asset" ADD CONSTRAINT "file_asset_library_asset_id_library_asset_id_fk" FOREIGN KEY ("library_asset_id") REFERENCES "public"."library_asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE TABLE "learning_center_section" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"topic" text NOT NULL,
	"audience_role" text DEFAULT 'all' NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "learning_center_section_slug_idx" ON "learning_center_section" USING btree ("slug");--> statement-breakpoint

CREATE TABLE "learning_center_item" (
	"id" text PRIMARY KEY NOT NULL,
	"section_id" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"body" text,
	"kind" text DEFAULT 'ARTICLE' NOT NULL,
	"url" text,
	"storage_key" text,
	"mime_type" text,
	"size_bytes" integer,
	"library_asset_id" text,
	"audience_role" text DEFAULT 'all' NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"visibility" "visibility" DEFAULT 'SHARED' NOT NULL,
	"is_placeholder" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "learning_center_item" ADD CONSTRAINT "learning_center_item_section_id_learning_center_section_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."learning_center_section"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_center_item" ADD CONSTRAINT "learning_center_item_library_asset_id_library_asset_id_fk" FOREIGN KEY ("library_asset_id") REFERENCES "public"."library_asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "learning_center_item_section_idx" ON "learning_center_item" USING btree ("section_id","order");
