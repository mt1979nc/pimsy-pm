-- Team capacity: hide a person from that page without deleting them.
-- Default false so existing staff stay visible. No rows are removed.

ALTER TABLE "user" ADD COLUMN "capacity_hidden" boolean DEFAULT false NOT NULL;
