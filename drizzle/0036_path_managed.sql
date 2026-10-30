-- People added in Settings stay under PATH. Import and staff seed skip them.
-- Existing rows stay false. No rows are deleted.

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "path_managed" boolean DEFAULT false NOT NULL;
