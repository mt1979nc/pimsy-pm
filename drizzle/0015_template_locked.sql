-- v1.13.8 Dock playbook lock + default eyelid visibility on template phases.
-- Live project phases are not rewritten; staff expose/hide those per site.

ALTER TABLE "project_template" ADD COLUMN "is_locked" boolean DEFAULT false NOT NULL;

UPDATE "project_template"
SET "is_locked" = true
WHERE "playbook_path" IS NOT NULL;

UPDATE "template_phase"
SET "visibility" = 'INTERNAL'
WHERE lower(trim("name")) NOT IN (
  'kickoff',
  'discovery',
  'rcm kickoff',
  'plan overview',
  'payer & enrollment'
);
