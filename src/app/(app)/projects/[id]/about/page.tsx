import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { requireStaff } from "@/lib/guard";
import { assertProjectAccess } from "@/lib/authz";
import { Card, CardHeader } from "@/components/ui";
import { ProjectAboutForm } from "./about-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "About" };

export default async function ProjectAboutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireStaff();
  await assertProjectAccess(actor, id);

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, id),
    columns: {
      id: true,
      name: true,
      hubspotDealUrl: true,
      prismClientId: true,
      crmAcronym: true,
      crmKey: true,
      zoomBookingUrl: true,
      aboutNotes: true,
      customFields: true,
    },
  });
  if (!project) notFound();

  return (
    <Card>
      <CardHeader
        title="About / site profile"
        subtitle="HubSpot, Prism, CRM keys, Zoom booking, and notes — Dock’s About tab."
      />
      <ProjectAboutForm
        project={{
          id: project.id,
          hubspotDealUrl: project.hubspotDealUrl,
          prismClientId: project.prismClientId,
          crmAcronym: project.crmAcronym,
          crmKey: project.crmKey,
          zoomBookingUrl: project.zoomBookingUrl,
          aboutNotes: project.aboutNotes,
          customFields: project.customFields ?? {},
        }}
      />
    </Card>
  );
}
