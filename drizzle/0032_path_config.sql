-- PATH settings. Seeded from the v1.18.28 hardcoded values so estimator and capacity stay the same.
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


INSERT INTO "path_config_load" ("id", "model") VALUES ('singleton', 'even') ON CONFLICT DO NOTHING;

INSERT INTO "path_config_phase" ("key", "label", "sort_order", "hours_weight") VALUES
  ('kickoff', 'Kickoff', 0, 1),
  ('discovery', 'Discovery', 1, 1),
  ('config', 'Config', 2, 1),
  ('training', 'Training', 3, 1),
  ('pregolive', 'Pre Go-Live', 4, 1),
  ('complete', 'Complete', 5, 1)
ON CONFLICT DO NOTHING;

INSERT INTO "path_config_status" ("key", "label", "sort_order", "counts_toward_load", "hold_hrs_per_week") VALUES
  ('active', 'Active', 0, true, null),
  ('stalled', 'Stalled', 1, true, null),
  ('special', 'Special', 2, true, null),
  ('pre-kickoff', 'Pre-kickoff', 3, true, null),
  ('pipeline', 'Pipeline', 4, false, null),
  ('pre-go-live', 'Pre Go-Live', 5, true, 2)
ON CONFLICT DO NOTHING;

INSERT INTO "path_config_slip_cause" ("key", "label", "sort_order") VALUES
  ('CUSTOMER', 'Customer', 0),
  ('PIMSY', 'PIMSY', 1)
ON CONFLICT DO NOTHING;

INSERT INTO "path_config_slip_approval" ("id", "approver_role", "threshold_days") VALUES ('singleton', 'DIRECTOR', 0) ON CONFLICT DO NOTHING;

INSERT INTO "path_config_role" ("kind", "key", "label", "sort_order", "permissions") VALUES
  ('app', 'OWNER', 'Owner', 0, '["admin","portfolio","templates","users","read_all","create_projects"]'::jsonb),
  ('app', 'ADMIN', 'Admin', 1, '["admin","portfolio","templates","users","read_all","create_projects"]'::jsonb),
  ('app', 'MANAGER', 'Manager', 2, '["portfolio","read_all","create_projects"]'::jsonb),
  ('app', 'SPECIALIST', 'Specialist', 3, '["read_all"]'::jsonb),
  ('app', 'MEMBER', 'Member', 4, '[]'::jsonb),
  ('app', 'CUSTOMER', 'Customer', 5, '["portal"]'::jsonb),
  ('staffing', 'IMPLEMENTATION_SPECIALIST', 'Implementation Specialist', 0, '[]'::jsonb),
  ('staffing', 'T1_BILLING_SUPPORT', 'T1 Billing Support', 1, '[]'::jsonb),
  ('staffing', 'T2_BILLING_SUPPORT', 'T2 Billing Support', 2, '[]'::jsonb),
  ('staffing', 'RCM_IMPLEMENTATION_SPECIALIST', 'RCM Implementation Specialist', 3, '[]'::jsonb),
  ('staffing', 'RCM_MANAGER', 'RCM Manager', 4, '[]'::jsonb),
  ('staffing', 'IMPLEMENTATION_DIRECTOR', 'Implementation Director', 5, '[]'::jsonb),
  ('staffing', 'SUPPORT_DIRECTOR', 'Support Director', 6, '[]'::jsonb),
  ('project', 'LEAD', 'Lead', 0, '[]'::jsonb),
  ('project', 'CONTRIBUTOR', 'Contributor', 1, '[]'::jsonb),
  ('project', 'OBSERVER', 'Observer', 2, '[]'::jsonb),
  ('project', 'CUSTOMER_CONTACT', 'Customer contact', 3, '[]'::jsonb),
  ('project', 'CUSTOMER_PROJECT_LEAD', 'Customer project lead', 4, '[]'::jsonb),
  ('project', 'CUSTOMER_BILLING', 'Customer billing', 5, '[]'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO "path_config_person" ("user_id", "can_lead", "capacity_exempt", "capacity_hidden", "hours_per_week")
SELECT "id", "can_lead", "capacity_exempt", "capacity_hidden", "capacity_hours_per_week" FROM "user"
ON CONFLICT DO NOTHING;

INSERT INTO "path_config_estimator_version" ("id", "version", "active", "weights", "note")
VALUES ('v1', 1, true, '{"orgSetupHours":2,"billingConfigHours":3,"otherSettingsHours":2,"minutesPerUser":15,"minutesPerLocation":30,"minutesPerFormPage":25,"coreTrainingSessions":7,"stateComplianceHours":2,"minimalOrgHours":10,"intakeAssistantHours":2,"configDays":14,"maxConfigHoursPerDay":4,"schedulingBufferDays":2,"trainingSessionHours":1,"trainingPrepHours":0.5,"trainingHoursPerSession":1.5,"payrollTrainingHours":1,"discoveryDays":{"OPTIMISTIC":10,"TYPICAL":14,"PESSIMISTIC":21},"complexClinical":["MEDICATION_MANAGEMENT","MAT","PSYCH_TESTING"],"serviceLineHours":{"OUTPATIENT_THERAPY":0,"MEDICATION_MANAGEMENT":1.5,"MAT":1,"IOP":1,"PHP":1,"GROUP_THERAPY":1,"INPATIENT_RESIDENTIAL":5,"PSYCH_TESTING":2,"PSR_PSYCHOSOCIAL_REHAB":0.5,"PRP_PSYCHIATRIC_REHAB":0.5,"MESSAGING":0.5,"EFAX":0.5,"LABS":2,"EVV":2,"PAYROLL":2,"EATING_DISORDER":2,"COURT_ORDERED_SERVICES":1,"OTHER_SERVICES":0.5},"serviceLineLabels":{"OUTPATIENT_THERAPY":"Outpatient Therapy","MEDICATION_MANAGEMENT":"Medication Management","MAT":"MAT","IOP":"IOP","PHP":"PHP","GROUP_THERAPY":"Group Therapy","INPATIENT_RESIDENTIAL":"Inpatient / Residential","PSYCH_TESTING":"Psych Testing","PSR_PSYCHOSOCIAL_REHAB":"PSR / Psychosocial Rehab","PRP_PSYCHIATRIC_REHAB":"PRP / Psychiatric Rehab","MESSAGING":"Messaging","EFAX":"eFax","LABS":"Labs","EVV":"EVV","PAYROLL":"Payroll","EATING_DISORDER":"Eating Disorder","COURT_ORDERED_SERVICES":"Court Ordered Services","OTHER_SERVICES":"Other Services"},"skipUsFederalHolidays":true}'::jsonb, 'Seeded from the v1.18.28 hardcoded Forecast+ weights.')
ON CONFLICT DO NOTHING;

INSERT INTO "path_config_service_line" ("key", "label", "hours", "sort_order", "complex_clinical") VALUES
  ('OUTPATIENT_THERAPY', 'Outpatient Therapy', 0, 0, false),
  ('MEDICATION_MANAGEMENT', 'Medication Management', 1.5, 1, true),
  ('MAT', 'MAT', 1, 2, true),
  ('IOP', 'IOP', 1, 3, false),
  ('PHP', 'PHP', 1, 4, false),
  ('GROUP_THERAPY', 'Group Therapy', 1, 5, false),
  ('INPATIENT_RESIDENTIAL', 'Inpatient / Residential', 5, 6, false),
  ('PSYCH_TESTING', 'Psych Testing', 2, 7, true),
  ('PSR_PSYCHOSOCIAL_REHAB', 'PSR / Psychosocial Rehab', 0.5, 8, false),
  ('PRP_PSYCHIATRIC_REHAB', 'PRP / Psychiatric Rehab', 0.5, 9, false),
  ('MESSAGING', 'Messaging', 0.5, 10, false),
  ('EFAX', 'eFax', 0.5, 11, false),
  ('LABS', 'Labs', 2, 12, false),
  ('EVV', 'EVV', 2, 13, false),
  ('PAYROLL', 'Payroll', 2, 14, false),
  ('EATING_DISORDER', 'Eating Disorder', 2, 15, false),
  ('COURT_ORDERED_SERVICES', 'Court Ordered Services', 1, 16, false),
  ('OTHER_SERVICES', 'Other Services', 0.5, 17, false)
ON CONFLICT DO NOTHING;

INSERT INTO "path_config_analytics_exclusion" ("code") VALUES
  ('SENSORI'),
  ('MHC'),
  ('LECHRIS')
ON CONFLICT DO NOTHING;

INSERT INTO "path_config_hiring" ("id", "lead_weeks", "utilization_percent", "near_percent", "typical_hours_per_week") VALUES ('singleton', 8, 100, 85, 30) ON CONFLICT DO NOTHING;

INSERT INTO "path_config_holiday" ("id", "skip_us_federal") VALUES ('singleton', true) ON CONFLICT DO NOTHING;

INSERT INTO "path_config_template" ("key", "name", "active", "sort_order") VALUES
  ('EHR', 'EHR Implementation only', true, 0),
  ('EHR_RCM', 'EHR + RCM', true, 1),
  ('RCM_LEGACY', 'Existing EHR + RCM Legacy (No Prism data)', true, 2),
  ('RCM_PRISM', 'Existing EHR + RCM (Yes Prism data)', true, 3)
ON CONFLICT DO NOTHING;

INSERT INTO "path_config_dock_allow" ("acronym", "included", "note") VALUES
  ('TANC', true, ''),
  ('RAC', true, 'Keep both RAC and TANC until Alexander consolidates.'),
  ('OCE', true, ''),
  ('FBH', true, ''),
  ('BHC', true, ''),
  ('MMHSS', true, ''),
  ('EBHKY', true, ''),
  ('LECHRIS', true, ''),
  ('BDMH', true, ''),
  ('DYM', true, ''),
  ('PWMI', true, ''),
  ('THS', true, ''),
  ('CEDAR', true, ''),
  ('CCCCARE', true, ''),
  ('SWMCCC', true, ''),
  ('RBH', true, ''),
  ('SENSORI', true, ''),
  ('MHC', true, ''),
  ('FFCS', true, ''),
  ('RENWICK', true, ''),
  ('CAPSTONE', true, ''),
  ('LIFECONN', true, ''),
  ('EHW', true, ''),
  ('GHW', true, ''),
  ('ROH', true, ''),
  ('APS', true, ''),
  ('PHR', true, ''),
  ('RPI', true, ''),
  ('ABQW', true, ''),
  ('SMSS', true, ''),
  ('NEOES', true, ''),
  ('MPA', true, ''),
  ('GTS', true, ''),
  ('UES', true, ''),
  ('DPS', true, '')
ON CONFLICT DO NOTHING;
