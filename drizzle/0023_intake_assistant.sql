-- v1.18.0 Forecast+: Intake Assistant is a 2h add-on flag on project_scope
-- (same boolean pattern as state_compliance / minimal_org_structure), not a
-- service line. Default false. Existing snapshots are not re-estimated.

ALTER TABLE "project_scope" ADD COLUMN "intake_assistant" boolean DEFAULT false NOT NULL;
