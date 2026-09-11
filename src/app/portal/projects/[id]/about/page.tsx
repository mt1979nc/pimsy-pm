import { notFound } from "next/navigation";
import { requireCustomer } from "@/lib/guard";
import { portalProject } from "@/lib/portal";
import { Card, CardHeader, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "About" };

export default async function PortalAboutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireCustomer();
  const project = await portalProject(actor, id);
  if (!project) notFound();

  const hasContent =
    Boolean(project.aboutNotes) ||
    Boolean(project.zoomBookingUrl) ||
    Boolean(project.crmAcronym);

  return (
    <Card>
      <CardHeader
        title="About this implementation"
        subtitle="Site profile shared by your PIMSY team."
      />
      {!hasContent ? (
        <EmptyState
          title="Nothing here yet"
          description="Your implementation specialist will add notes and booking links as the project gets going."
        />
      ) : (
        <div className="space-y-4 p-5">
          {project.crmAcronym ? (
            <div>
              <div className="text-[11.5px] uppercase tracking-wide text-ink-3">Account</div>
              <div className="mt-0.5 text-[14px] font-medium text-ink">{project.crmAcronym}</div>
            </div>
          ) : null}

          {project.zoomBookingUrl ? (
            <div>
              <div className="text-[11.5px] uppercase tracking-wide text-ink-3">Book a call</div>
              <a
                href={project.zoomBookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 inline-block text-[14px] font-medium text-brand hover:underline"
              >
                Open Zoom booking
              </a>
            </div>
          ) : null}

          {project.aboutNotes ? (
            <div>
              <div className="text-[11.5px] uppercase tracking-wide text-ink-3">Notes</div>
              <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">
                {project.aboutNotes}
              </p>
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}
