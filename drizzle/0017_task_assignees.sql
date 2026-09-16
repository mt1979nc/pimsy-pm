-- v1.14.2 multi-assignee + role auto-assign.
-- Keep task.assignee_id as the denormalized primary (first remaining) assignee.
-- Customer project-lead / billing roles are additive enum values.

ALTER TYPE "public"."project_member_role" ADD VALUE 'CUSTOMER_PROJECT_LEAD';--> statement-breakpoint
ALTER TYPE "public"."project_member_role" ADD VALUE 'CUSTOMER_BILLING';--> statement-breakpoint

CREATE TABLE "task_assignee" (
	"task_id" text NOT NULL,
	"user_id" text NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by_id" text,
	"source" text DEFAULT 'MANUAL' NOT NULL,
	CONSTRAINT "task_assignee_task_id_user_id_pk" PRIMARY KEY("task_id","user_id")
);--> statement-breakpoint

ALTER TABLE "task_assignee" ADD CONSTRAINT "task_assignee_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignee" ADD CONSTRAINT "task_assignee_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignee" ADD CONSTRAINT "task_assignee_assigned_by_id_user_id_fk" FOREIGN KEY ("assigned_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_assignee_user_idx" ON "task_assignee" USING btree ("user_id");--> statement-breakpoint

INSERT INTO "task_assignee" ("task_id", "user_id", "source")
SELECT "id", "assignee_id", 'MANUAL'
FROM "task"
WHERE "assignee_id" IS NOT NULL
ON CONFLICT DO NOTHING;
