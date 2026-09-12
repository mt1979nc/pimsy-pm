-- v1.10 Forecast: org-configurable Analysis primary-average exclusions.
-- Default matches locked Prism outliers (SENSORI / MHC / LECHRIS).
-- Native Postgres only — no Prism Azure SQL.

ALTER TABLE "org_settings" ADD COLUMN "forecast_analysis_exclusions" jsonb;--> statement-breakpoint
UPDATE "org_settings"
SET "forecast_analysis_exclusions" = '["SENSORI","MHC","LECHRIS"]'::jsonb
WHERE "forecast_analysis_exclusions" IS NULL;
