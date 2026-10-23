CREATE TABLE IF NOT EXISTS "daily_facts" (
  "fact_date" text PRIMARY KEY,
  "gap" boolean NOT NULL DEFAULT false,
  "wip_shape" text NOT NULL DEFAULT 'unknown',
  "wip_sites" integer,
  "overdue_tasks" integer,
  "task_done" integer,
  "task_total" integer,
  "target_passed" integer,
  "open_threads" integer,
  "waiting_on_pimsy" integer,
  "waiting_on_customer" integer,
  "prism_load_hours" real,
  "prism_capacity_hours" real,
  "slip_days" integer,
  "zendesk_open" integer,
  "note" text NOT NULL DEFAULT '',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "daily_fact_owners" (
  "fact_date" text NOT NULL REFERENCES "daily_facts"("fact_date") ON DELETE CASCADE,
  "owner" text NOT NULL,
  "team" text NOT NULL DEFAULT '',
  "wip_sites" integer NOT NULL DEFAULT 0,
  PRIMARY KEY ("fact_date", "owner", "team")
);
