-- v1.18.18 PATH: customer logo. Projects display the customer's mark.
-- logo_url is an https link (Dock account logo or a pasted URL).
-- logo_storage_key is an uploaded file served at /api/customer-logos/[id].

ALTER TABLE "customer_account" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "customer_account" ADD COLUMN "logo_storage_key" text;
