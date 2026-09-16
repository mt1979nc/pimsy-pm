import { asc } from "drizzle-orm";
import { db } from "@/db";
import { projectTemplates } from "@/db/schema";
import { requireAdmin } from "@/lib/guard";
import {
  PageHeader,
  Card,
  CardHeader,
  EmptyState,
  Badge,
  VisibilityBadge,
  LinkButton,
} from "@/components/ui";
import { TemplateHubNav } from "@/components/template-hub-nav";
import { DuplicateTemplateButton } from "./duplicate-template-button";
import { PLAYBOOK_PATH_META, collectTemplateAreaRows, optionalAreaLabel } from "@/lib/playbook-meta";

export const dynamic = "force-dynamic";
export const metadata = { title: "Templates" };

export default async function TemplatesPage() {
  // Templates are the standard playbooks every project starts from — an
  // org-configuration concern, not a day-to-day delivery one. Same
  // OWNER/ADMIN-only bar as canManageTemplates(), so it's consistent with
  // the editor, file library, and duplicate flow.
  await requireAdmin();

  const templates = await db.query.projectTemplates.findMany({
    orderBy: [asc(projectTemplates.name)],
    with: {
      phases: {
        with: {
          tasks: {
            with: {
              defaultAttachments: { with: { libraryAsset: true } },
              checklistItems: true,
            },
          },
        },
        orderBy: (p, { asc: a }) => [a(p.order)],
      },
      milestones: { orderBy: (m, { asc: a }) => [a(m.order)] },
    },
  });

  return (
    <>
      <PageHeader
        title="Templates"
        subtitle="Dock-style playbooks: phases, nested tasks, descriptions, default files, and training checklists. New projects clone the chosen path."
        actions={
          <div className="flex flex-wrap gap-2">
            <LinkButton href="/library" size="sm">
              File library
            </LinkButton>
            <LinkButton href="/projects/new" variant="primary">
              Use a template
            </LinkButton>
          </div>
        }
      />
      <TemplateHubNav current="/templates" />

      {templates.length === 0 ? (
        <Card>
          <EmptyState
            title="No templates yet"
            description="Run the seed script to load the PIMSY implementation playbook."
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {templates.map((t) => {
            const allTasks = t.phases.flatMap((p) => p.tasks);
            const customerTasks = allTasks.filter((x) => x.ownerSide === "CUSTOMER");
            const nested = allTasks.filter((x) => x.parentTaskId).length;
            const checklists = allTasks.reduce((n, x) => n + x.checklistItems.length, 0);
            const attachments = allTasks.reduce((n, x) => n + x.defaultAttachments.length, 0);
            const areas = collectTemplateAreaRows(t.phases);
            const pathLabel = t.playbookPath ? PLAYBOOK_PATH_META[t.playbookPath].title : "Custom playbook";
            return (
              <Card key={t.id}>
                <CardHeader
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      {t.name}
                      {!t.isActive ? <Badge>Inactive</Badge> : null}
                      {t.isLocked ? <Badge tone="amber">Locked</Badge> : null}
                      <Badge tone={t.playbookPath ? "violet" : "neutral"}>{pathLabel}</Badge>
                    </span>
                  }
                  subtitle={t.description}
                  action={
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge>{t.phases.length} phases</Badge>
                      <Badge>{allTasks.length} tasks</Badge>
                      {nested > 0 ? <Badge>{nested} nested</Badge> : null}
                      {checklists > 0 ? <Badge>{checklists} checklist</Badge> : null}
                      {attachments > 0 ? <Badge>{attachments} files</Badge> : null}
                      <Badge tone="violet">{customerTasks.length} customer</Badge>
                      <Badge>{t.durationDays} days</Badge>
                      <DuplicateTemplateButton templateId={t.id} name={t.name} />
                      <LinkButton href={`/templates/${t.id}`} size="sm" variant="primary">
                        Edit
                      </LinkButton>
                    </div>
                  }
                />
                {areas.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 border-b border-border px-5 py-2.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                      Optional areas
                    </span>
                    {areas.map((area) => (
                      <Badge key={area.key} tone={area.optionalCount > 0 ? "amber" : "neutral"}>
                        {optionalAreaLabel(area.key)} · {area.taskCount}
                        {area.optionalCount > 0 ? ` (${area.optionalCount} optional)` : ""}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                <div className="divide-y divide-border">
                  {t.phases.map((p) => {
                    const custom = p.tasks.filter((x) => x.ownerSide === "CUSTOMER").length;
                    return (
                      <details key={p.id} className="group">
                        <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-2.5 hover:bg-surface-2">
                          <span className="w-6 shrink-0 text-[12px] tabular-nums text-ink-3">
                            {p.order + 1}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">
                            {p.name}
                          </span>
                          <VisibilityBadge visibility={p.visibility} />
                          <span className="shrink-0 text-[12px] text-ink-3">
                            day {p.offsetDays}–{p.offsetDays + p.durationDays}
                          </span>
                          <Badge>{p.tasks.length}</Badge>
                          {custom > 0 ? <Badge tone="violet">{custom} customer</Badge> : null}
                          <span className="text-[11px] text-ink-3 group-open:hidden">show</span>
                        </summary>
                        <div className="divide-y divide-border border-t border-border bg-surface-2">
                          {p.tasks.map((task) => (
                            <div
                              key={task.id}
                              className="flex items-center gap-3 py-1.5 pl-14 pr-5"
                            >
                              {task.parentTaskId ? (
                                <span className="text-[11px] text-ink-3">↳</span>
                              ) : null}
                              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">
                                {task.title}
                              </span>
                              {task.checklistItems.length > 0 ? (
                                <Badge>{task.checklistItems.length} areas</Badge>
                              ) : null}
                              {task.defaultAttachments.map((att) => (
                                <Badge
                                  key={att.id}
                                  tone={att.libraryAsset?.kind === "LINK" ? "green" : "neutral"}
                                >
                                  {att.libraryAsset?.kind === "LINK" ? "Link/Form" : "File"}:{" "}
                                  {att.libraryAsset?.name ?? "attachment"}
                                </Badge>
                              ))}
                              {task.ownerSide === "CUSTOMER" ? (
                                <Badge tone="violet">Customer</Badge>
                              ) : null}
                              <VisibilityBadge visibility={task.visibility} />
                            </div>
                          ))}
                        </div>
                      </details>
                    );
                  })}
                </div>

                {t.milestones.length > 0 ? (
                  <div className="border-t border-border px-5 py-3">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                      Milestones
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {t.milestones.map((m) => (
                        <Badge key={m.id} tone={m.isGoLive ? "violet" : "neutral"}>
                          {m.name} · day {m.offsetDays}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-5 max-w-2xl text-[12.5px] leading-relaxed text-ink-3">
        Playbook tasks mirror Dock Implementation: blue task action buttons with
        the live PWMI labels (<strong>Click Here</strong> for Organization
        Details Form / the wizard, <strong>Click Here to Submit Clinical
        Workflow Form</strong>, <strong>Click Here to Submit Billing
        Questionnaire</strong>, <strong>Upload files</strong>,{" "}
        <strong>Open form</strong>), download → complete → upload copy on
        customer file requests, and training descriptions.
        Duplicate makes a custom copy so the four site-creation paths stay put. New workspaces
        inherit that copy automatically. Billing Configuration is a billing-team
        tab with connected Discovery/Configuration copies; Move to tab can send
        overlapping work onto an RCM section.
        Live projects are not rewritten when the template changes — run{" "}
        <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11.5px]">
          npm run db:resync:playbook-from-dock -- --apply
        </code>{" "}
        in Azure Cloud Shell to backfill missing descriptions, checklists, and default files on
        existing WIP without deleting staff notes or user uploads (dry-run logs progress and
        stops at 180s unless you pass{" "}
        <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11.5px]">--timeout-sec 0</code>
        ).         Canonical path playbooks are <strong>locked</strong> so “not available”
        junk is not edited into the live template — Duplicate to customize, or
        Unlock (owner/admin) if you must edit. To reset the four standard paths
        from code (and restore Dock expose/hide defaults), run{" "}
        <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11.5px]">
          npm run db:seed -- --templates-only
        </code>
        . That replaces playbook rows only; live projects keep their tasks.
        New workspaces inherit eyelid defaults (Kickoff + Discovery exposed;
        Configuration / Accessing Pimsy / Training hidden until staff expose).
      </p>
    </>
  );
}
