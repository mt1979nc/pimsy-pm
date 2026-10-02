-- v1.18.21 Dock delivery analytics snapshots.
-- Implementation WIP sites and open threads only. Does not write task or playbook rows.

CREATE TABLE "dock_delivery_snapshots" (
  "id" text PRIMARY KEY NOT NULL,
  "retrieved_at" timestamp with time zone NOT NULL,
  "wip_retrieved_at" timestamp with time zone,
  "threads_retrieved_at" timestamp with time zone,
  "source_url" text,
  "filters" jsonb,
  "totals" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "content_hash" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "dock_delivery_snapshot_retrieved_idx" ON "dock_delivery_snapshots" USING btree ("retrieved_at");--> statement-breakpoint
CREATE INDEX "dock_delivery_snapshot_created_idx" ON "dock_delivery_snapshots" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "dock_delivery_snapshot_hash_idx" ON "dock_delivery_snapshots" USING btree ("content_hash");--> statement-breakpoint
CREATE TABLE "dock_delivery_sites" (
  "id" text PRIMARY KEY NOT NULL,
  "snapshot_id" text NOT NULL,
  "acronym" text NOT NULL,
  "name" text NOT NULL,
  "owners" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "target_end" text,
  "actual_end" text,
  "overdue_task_count" integer,
  "status" text,
  "acronym_inferred" boolean DEFAULT false NOT NULL,
  "waiting_on_pimsy" integer DEFAULT 0 NOT NULL,
  "waiting_on_customer" integer DEFAULT 0 NOT NULL,
  "waiting_unknown" integer DEFAULT 0 NOT NULL,
  "open_thread_count" integer DEFAULT 0 NOT NULL
);--> statement-breakpoint
ALTER TABLE "dock_delivery_sites" ADD CONSTRAINT "dock_delivery_sites_snapshot_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."dock_delivery_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dock_delivery_site_snapshot_acronym_idx" ON "dock_delivery_sites" USING btree ("snapshot_id", "acronym");--> statement-breakpoint
CREATE INDEX "dock_delivery_site_snapshot_idx" ON "dock_delivery_sites" USING btree ("snapshot_id");--> statement-breakpoint
CREATE TABLE "dock_delivery_threads" (
  "id" text PRIMARY KEY NOT NULL,
  "snapshot_id" text NOT NULL,
  "acronym" text NOT NULL,
  "dock_thread_key" text NOT NULL,
  "type" text,
  "title" text NOT NULL,
  "waiting_on" text NOT NULL,
  "last_poster" text,
  "last_activity" text,
  "snippet" text,
  "url" text,
  "internal" boolean
);--> statement-breakpoint
ALTER TABLE "dock_delivery_threads" ADD CONSTRAINT "dock_delivery_threads_snapshot_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."dock_delivery_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dock_delivery_thread_snapshot_key_idx" ON "dock_delivery_threads" USING btree ("snapshot_id", "dock_thread_key");--> statement-breakpoint
CREATE INDEX "dock_delivery_thread_snapshot_acronym_idx" ON "dock_delivery_threads" USING btree ("snapshot_id", "acronym");