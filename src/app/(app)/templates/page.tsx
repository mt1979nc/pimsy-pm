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

export const dynamic = "force-dynamic";
export const metadata = { title: "Templates" };

export default async function TemplatesPage() {
  // Templates are the standard playbooks every project starts from — an
  // org-configuration concern, not a day-to-day delivery one. Same
  // OWNER/ADMIN-only bar as canManageTemplates(), so it's consistent with
  // whatever template-editing UI comes next.
  await requireAdmin();

  const templates = await db.query.projectTemplates.findMany({
    orderBy: [asc(projectTemplates.name)],
    with: {
      phases: {
        with: { tasks: true },
        orderBy: (p, { asc: a }) => [a(p.order)],
      },
      milestones: { orderBy: (m, { asc: a }) => [a(m.order)] },
    },
  });

  return (
    <>
      <PageHeader
        title="Templates"
        subtitle="The standard playbooks. Every new project can start from one of these."
        actions={
          <LinkButton href="/projects/new" variant="primary">
            Use a template
          </LinkButton>
        }
      />

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
            return (
              <Card key={t.id}>
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      {t.name}
                      {!t.isActive ? <Badge>Inactive</Badge> : null}
                    </span>
                  }
                  subtitle={t.description}
                  action={
                    <div className="flex flex-wrap gap-1.5">
                      <Badge>{t.phases.length} phases</Badge>
                      <Badge>{allTasks.length} tasks</Badge>
                      <Badge tone="violet">{customerTasks.length} customer</Badge>
                      <Badge>{t.durationDays} days</Badge>
                    </div>
                  }
                />
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
                              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">
                                {task.title}
                              </span>
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
        Templates are edited in the database for now — see{" "}
        <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11.5px]">
          src/db/template-implementation.ts
        </code>{" "}
        and re-run{" "}
        <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11.5px]">
          npm run db:seed -- --templates-only
        </code>
        . A visual template editor is the natural next addition.
      </p>
    </>
  );
}
