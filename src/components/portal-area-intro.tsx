import Link from "next/link";

/**
 * Informational area copy with links into the real tasks — Discovery (and
 * peers) must not be dead text on the portal or Customer view.
 */
export function PortalAreaIntro({
  phaseName,
  description,
  tasks,
  taskHref,
}: {
  phaseName: string;
  description?: string | null;
  tasks: Array<{ id: string; title: string }>;
  taskHref: (taskId: string) => string;
}) {
  const discovery = /discovery/i.test(phaseName);
  return (
    <div className="space-y-2 px-5 pb-3 pt-1 text-[13px] leading-relaxed text-ink-2">
      {description ? <p>{description}</p> : null}
      {tasks.length > 0 ? (
        <p>
          {discovery
            ? "These Discovery items are real tasks — open one to complete it:"
            : "Open a task to see what’s needed and mark it done:"}{" "}
          {tasks.map((t, i) => (
            <span key={t.id}>
              {i > 0 ? <span className="text-ink-3"> · </span> : null}
              <Link href={taskHref(t.id)} className="font-medium text-brand hover:underline">
                {t.title}
              </Link>
            </span>
          ))}
        </p>
      ) : discovery ? (
        <p>No customer Discovery tasks are visible in this area yet.</p>
      ) : null}
    </div>
  );
}
