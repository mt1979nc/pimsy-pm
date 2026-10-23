/**
 * Prints drizzle/0032 seed SQL from the TypeScript defaults.
 * Run only when regenerating that migration. Not part of app startup.
 */
import { DEFAULT_PATH_CONFIG } from "../src/lib/path-config-defaults";

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const b = (v: boolean) => (v ? "true" : "false");
const n = (v: number | null) => (v == null ? "null" : String(v));

const c = DEFAULT_PATH_CONFIG;
const parts: string[] = [];
parts.push(`-- PATH settings. Seeded from the v1.18.28 hardcoded values so estimator and capacity stay the same.
-- Adds tables only. No drops. Tags, custom fields, and extra holiday dates start empty.

CREATE TABLE IF NOT EXISTS "path_config_load" (
  "id" text PRIMARY KEY DEFAULT 'singleton',
  "model" text NOT NULL DEFAULT 'even'
);

CREATE TABLE IF NOT EXISTS "path_config_phase" (
  "key" text PRIMARY KEY,
  "label" text NOT NULL,
  "sort_order" integer NOT NULL,
  "hours_weight" real NOT NULL
);

CREATE TABLE IF NOT EXISTS "path_config_status" (
  "key" text PRIMARY KEY,
  "label" text NOT NULL,
  "sort_order" integer NOT NULL,
  "counts_toward_load" boolean NOT NULL,
  "hold_hrs_per_week" real
);

CREATE TABLE IF NOT EXISTS "path_config_slip_cause" (
  "key" text PRIMARY KEY,
  "label" text NOT NULL,
  "sort_order" integer NOT NULL
);

CREATE TABLE IF NOT EXISTS "path_config_slip_approval" (
  "id" text PRIMARY KEY DEFAULT 'singleton',
  "approver_role" text NOT NULL,
  "threshold_days" integer NOT NULL
);

CREATE TABLE IF NOT EXISTS "path_config_role" (
  "key" text NOT NULL,
  "kind" text NOT NULL,
  "label" text NOT NULL,
  "sort_order" integer NOT NULL,
  "permissions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY ("kind", "key")
);

CREATE TABLE IF NOT EXISTS "path_config_person" (
  "user_id" text PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  "can_lead" boolean NOT NULL,
  "capacity_exempt" boolean NOT NULL,
  "capacity_hidden" boolean NOT NULL,
  "hours_per_week" integer NOT NULL
);

CREATE TABLE IF NOT EXISTS "path_config_estimator_version" (
  "id" text PRIMARY KEY,
  "version" integer NOT NULL,
  "active" boolean NOT NULL DEFAULT false,
  "weights" jsonb NOT NULL,
  "note" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "path_config_estimator_version_version_idx" ON "path_config_estimator_version" ("version");

CREATE TABLE IF NOT EXISTS "path_config_service_line" (
  "key" text PRIMARY KEY,
  "label" text NOT NULL,
  "hours" real NOT NULL,
  "sort_order" integer NOT NULL,
  "complex_clinical" boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS "path_config_analytics_exclusion" (
  "code" text PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS "path_config_hiring" (
  "id" text PRIMARY KEY DEFAULT 'singleton',
  "lead_weeks" integer NOT NULL,
  "utilization_percent" real NOT NULL,
  "near_percent" real NOT NULL,
  "typical_hours_per_week" integer NOT NULL
);

CREATE TABLE IF NOT EXISTS "path_config_holiday" (
  "id" text PRIMARY KEY DEFAULT 'singleton',
  "skip_us_federal" boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS "path_config_holiday_date" (
  "observed_on" text PRIMARY KEY,
  "name" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "path_config_tag" (
  "name" text PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS "path_config_custom_field" (
  "id" text PRIMARY KEY,
  "entity" text NOT NULL,
  "key" text NOT NULL,
  "label" text NOT NULL,
  "field_type" text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "path_config_custom_field_entity_key_idx" ON "path_config_custom_field" ("entity", "key");

CREATE TABLE IF NOT EXISTS "path_config_template" (
  "key" text PRIMARY KEY,
  "name" text NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL
);

CREATE TABLE IF NOT EXISTS "path_config_dock_allow" (
  "acronym" text PRIMARY KEY,
  "included" boolean NOT NULL DEFAULT true,
  "note" text NOT NULL DEFAULT ''
);
`);

parts.push(
  `INSERT INTO "path_config_load" ("id", "model") VALUES ('singleton', ${q(c.loadModel)}) ON CONFLICT DO NOTHING;`,
);
parts.push(
  `INSERT INTO "path_config_phase" ("key", "label", "sort_order", "hours_weight") VALUES\n${c.phases
    .map((p) => `  (${q(p.key)}, ${q(p.label)}, ${p.sortOrder}, ${p.hoursWeight})`)
    .join(",\n")}\nON CONFLICT DO NOTHING;`,
);
parts.push(
  `INSERT INTO "path_config_status" ("key", "label", "sort_order", "counts_toward_load", "hold_hrs_per_week") VALUES\n${c.statuses
    .map(
      (s) =>
        `  (${q(s.key)}, ${q(s.label)}, ${s.sortOrder}, ${b(s.countsTowardLoad)}, ${n(s.holdHrsPerWeek)})`,
    )
    .join(",\n")}\nON CONFLICT DO NOTHING;`,
);
parts.push(
  `INSERT INTO "path_config_slip_cause" ("key", "label", "sort_order") VALUES\n${c.slipCauses
    .map((s) => `  (${q(s.key)}, ${q(s.label)}, ${s.sortOrder})`)
    .join(",\n")}\nON CONFLICT DO NOTHING;`,
);
parts.push(
  `INSERT INTO "path_config_slip_approval" ("id", "approver_role", "threshold_days") VALUES ('singleton', ${q(c.slipApproval.approverRole)}, ${c.slipApproval.thresholdDays}) ON CONFLICT DO NOTHING;`,
);
parts.push(
  `INSERT INTO "path_config_role" ("kind", "key", "label", "sort_order", "permissions") VALUES\n${c.roles
    .map(
      (r) =>
        `  (${q(r.kind)}, ${q(r.key)}, ${q(r.label)}, ${r.sortOrder}, ${q(JSON.stringify(r.permissions))}::jsonb)`,
    )
    .join(",\n")}\nON CONFLICT DO NOTHING;`,
);
parts.push(`INSERT INTO "path_config_person" ("user_id", "can_lead", "capacity_exempt", "capacity_hidden", "hours_per_week")
SELECT "id", "can_lead", "capacity_exempt", "capacity_hidden", "capacity_hours_per_week" FROM "user"
ON CONFLICT DO NOTHING;`);
parts.push(`INSERT INTO "path_config_estimator_version" ("id", "version", "active", "weights", "note")
VALUES ('v1', 1, true, ${q(JSON.stringify(c.estimator))}::jsonb, 'Seeded from the v1.18.28 hardcoded Forecast+ weights.')
ON CONFLICT DO NOTHING;`);
parts.push(
  `INSERT INTO "path_config_service_line" ("key", "label", "hours", "sort_order", "complex_clinical") VALUES\n${c.serviceLines
    .map((s) => `  (${q(s.key)}, ${q(s.label)}, ${s.hours}, ${s.sortOrder}, ${b(s.complexClinical)})`)
    .join(",\n")}\nON CONFLICT DO NOTHING;`,
);
parts.push(
  `INSERT INTO "path_config_analytics_exclusion" ("code") VALUES\n${c.analyticsExclusions
    .map((code) => `  (${q(code)})`)
    .join(",\n")}\nON CONFLICT DO NOTHING;`,
);
parts.push(
  `INSERT INTO "path_config_hiring" ("id", "lead_weeks", "utilization_percent", "near_percent", "typical_hours_per_week") VALUES ('singleton', ${c.hiring.leadWeeks}, ${c.hiring.utilizationPercent}, ${c.hiring.nearPercent}, ${c.hiring.typicalHoursPerWeek}) ON CONFLICT DO NOTHING;`,
);
parts.push(
  `INSERT INTO "path_config_holiday" ("id", "skip_us_federal") VALUES ('singleton', ${b(c.skipUsFederalHolidays)}) ON CONFLICT DO NOTHING;`,
);
parts.push(
  `INSERT INTO "path_config_template" ("key", "name", "active", "sort_order") VALUES\n${c.templates
    .map((t) => `  (${q(t.key)}, ${q(t.name)}, ${b(t.active)}, ${t.sortOrder})`)
    .join(",\n")}\nON CONFLICT DO NOTHING;`,
);
parts.push(
  `INSERT INTO "path_config_dock_allow" ("acronym", "included", "note") VALUES\n${c.dockAllowlist
    .map((d) => `  (${q(d.acronym)}, ${b(d.included)}, ${q(d.note)})`)
    .join(",\n")}\nON CONFLICT DO NOTHING;`,
);

process.stdout.write(`${parts.join("\n\n")}\n`);
