-- v1.13.3 Forecast+ / Add-to-roster: skip observed US federal holidays when
-- projecting go-live. Default on; Prism-parity math is the toggle-off path.

ALTER TABLE "project_scope" ADD COLUMN "skip_us_federal_holidays" boolean DEFAULT true NOT NULL;
