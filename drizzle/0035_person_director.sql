-- Settings person rows store the director flag with lead, exempt, and hours.
-- Copy the current user flag so existing directors stay directors.
-- Adds a column only. No rows are deleted.

ALTER TABLE "path_config_person" ADD COLUMN "is_director" boolean DEFAULT false NOT NULL;

UPDATE "path_config_person" AS p
SET "is_director" = u."is_director"
FROM "user" AS u
WHERE u."id" = p."user_id";
