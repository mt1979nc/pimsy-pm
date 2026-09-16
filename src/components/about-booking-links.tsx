import {
  hasAnyBookingUrl,
  portalBookingLinks,
  resolveProjectBookingUrls,
  type BookingUrlMap,
} from "@/lib/booking-urls";

export function AboutBookingLinks({
  urls,
  specialistName,
}: {
  urls: BookingUrlMap;
  specialistName?: string | null;
}) {
  const links = portalBookingLinks(urls, { specialistName });
  if (links.length === 0) return null;

  return (
    <div>
      <div className="text-[11.5px] uppercase tracking-wide text-ink-3">Book a session</div>
      <ul className="mt-1.5 space-y-1.5">
        {links.map((link) => (
          <li key={link.type}>
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-[14px] font-medium text-brand hover:underline"
            >
              {link.hint ?? `Book ${link.label.toLowerCase()}`}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function aboutHasBookingContent(project: {
  bookingUrls?: unknown;
  zoomBookingUrl?: string | null;
  aboutNotes?: string | null;
  crmAcronym?: string | null;
  lead?: { zoomBookingUrl?: string | null; name?: string | null } | null;
}): { hasContent: boolean; urls: BookingUrlMap; specialistName: string | null } {
  const urls = resolveProjectBookingUrls(project);
  return {
    hasContent:
      Boolean(project.aboutNotes) || Boolean(project.crmAcronym) || hasAnyBookingUrl(urls),
    urls,
    specialistName: project.lead?.name ?? null,
  };
}
