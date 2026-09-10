ALTER TABLE "template_task" ADD COLUMN "parent_task_id" text;
ALTER TABLE "template_task" ADD CONSTRAINT "template_task_parent_task_id_template_task_id_fk" FOREIGN KEY ("parent_task_id") REFERENCES "public"."template_task"("id") ON DELETE cascade ON UPDATE no action;
