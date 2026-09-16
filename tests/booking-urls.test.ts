import { describe, expect, it } from "vitest";
import {
  BOOKING_FORM_FIELD,
  BOOKING_MEETING_LABELS,
  BOOKING_MEETING_TYPES,
  bookingButtonLabel,
  bookingHrefForTitle,
  bookingMeetingTypeForTitle,
  hasAnyBookingUrl,
  migrateLegacyZoomBooking,
  normalizeBookingUrls,
  parseBookingUrlsFromForm,
  parseOptionalStaffBookingUrl,
  portalBookingLinks,
  resolveProjectBookingUrls,
} from "@/lib/booking-urls";
import { DISCOVERY_WIZARD_URL } from "@/db/dock-default-attachments";
import { resolveTaskActionButtons } from "@/lib/playbook-resources";

const URLS = {
  kickoff: "https://zoom.us/book/sam-kickoff",
  workflowDiscovery: "https://inbed.example/workflow",
  billingDiscovery: "https://inbed.example/billing",
  training1: "https://inbed.example/t1",
  training2: "https://inbed.example/t2",
  training3: "https://inbed.example/t3",
};

describe("per-meeting-type booking URLs", () => {
  it("names the six PATH meeting types", () => {
    expect(BOOKING_MEETING_TYPES).toEqual([
      "kickoff",
      "workflowDiscovery",
      "billingDiscovery",
      "training1",
      "training2",
      "training3",
    ]);
    expect(BOOKING_MEETING_LABELS.workflowDiscovery).toBe("Workflow discovery");
    expect(BOOKING_MEETING_LABELS.training3).toBe("Training 3");
    expect(BOOKING_FORM_FIELD.kickoff).toBe("bookingUrl_kickoff");
  });

  it("drops unknown keys and non-http values", () => {
    expect(
      normalizeBookingUrls({
        kickoff: "https://zoom.us/book/ok",
        extra: "https://evil.example",
        training1: "javascript:alert(1)",
        training2: "not a url",
      }),
    ).toEqual({ kickoff: "https://zoom.us/book/ok" });
  });

  it("copies a legacy Zoom URL into kickoff when that slot is empty", () => {
    expect(migrateLegacyZoomBooking("https://zoom.us/legacy", {})).toEqual({
      kickoff: "https://zoom.us/legacy",
    });
    expect(
      migrateLegacyZoomBooking("https://zoom.us/legacy", { kickoff: "https://zoom.us/override" }),
    ).toEqual({ kickoff: "https://zoom.us/override" });
  });

  it("resolves kickoff from About, then legacy Zoom, then the assigned specialist", () => {
    expect(
      resolveProjectBookingUrls({
        bookingUrls: { training1: URLS.training1 },
        zoomBookingUrl: null,
        lead: { zoomBookingUrl: URLS.kickoff },
      }),
    ).toEqual({ training1: URLS.training1, kickoff: URLS.kickoff });

    expect(
      resolveProjectBookingUrls({
        bookingUrls: { kickoff: "https://zoom.us/site-kickoff" },
        lead: { zoomBookingUrl: URLS.kickoff },
      }).kickoff,
    ).toBe("https://zoom.us/site-kickoff");

    expect(
      resolveProjectBookingUrls({
        bookingUrls: {},
        zoomBookingUrl: "https://zoom.us/legacy",
        lead: { zoomBookingUrl: URLS.kickoff },
      }).kickoff,
    ).toBe("https://zoom.us/legacy");
  });

  it("maps Schedule playbook titles to the matching meeting type", () => {
    expect(bookingMeetingTypeForTitle("Schedule Kickoff")).toBe("kickoff");
    expect(bookingMeetingTypeForTitle("Schedule: Workflow Guided Discovery")).toBe(
      "workflowDiscovery",
    );
    expect(bookingMeetingTypeForTitle("Schedule Billing Workflow Discovery Meeting")).toBe(
      "billingDiscovery",
    );
    expect(bookingMeetingTypeForTitle("Schedule Training 1")).toBe("training1");
    expect(bookingMeetingTypeForTitle("Schedule Training 2")).toBe("training2");
    expect(bookingMeetingTypeForTitle("Schedule Training 3")).toBe("training3");
    expect(bookingMeetingTypeForTitle("Schedule Training 4")).toBeNull();
    expect(bookingMeetingTypeForTitle("Schedule RCM kickoff")).toBeNull();
    expect(bookingMeetingTypeForTitle("Guided Discovery Meeting")).toBeNull();
    expect(bookingMeetingTypeForTitle("Training 1: Intro to PIMSY")).toBeNull();
  });

  it("does not invent a href when that meeting type has no URL", () => {
    expect(bookingHrefForTitle("Schedule Training 1", { training2: URLS.training2 })).toBeNull();
    expect(bookingHrefForTitle("Schedule Training 1", URLS)).toBe(URLS.training1);
  });

  it("lists only configured portal links, with specialist name on kickoff", () => {
    const links = portalBookingLinks(
      { kickoff: URLS.kickoff, training1: URLS.training1 },
      { specialistName: "Sam Specialist" },
    );
    expect(links.map((l) => l.type)).toEqual(["kickoff", "training1"]);
    expect(links[0]?.hint).toBe("Book kickoff with Sam Specialist");
    expect(hasAnyBookingUrl({})).toBe(false);
    expect(hasAnyBookingUrl({ training2: URLS.training2 })).toBe(true);
  });

  it("parses About form fields and rejects javascript URLs", () => {
    const form = new FormData();
    form.set(BOOKING_FORM_FIELD.workflowDiscovery, "inbed.example/workflow");
    form.set(BOOKING_FORM_FIELD.training1, "https://inbed.example/t1");
    const ok = parseBookingUrlsFromForm(form);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.urls.workflowDiscovery).toBe("https://inbed.example/workflow");
      expect(ok.urls.training1).toBe("https://inbed.example/t1");
      expect(ok.urls.kickoff).toBeUndefined();
    }

    const bad = new FormData();
    bad.set(BOOKING_FORM_FIELD.kickoff, "javascript:alert(1)");
    const refused = parseBookingUrlsFromForm(bad);
    expect(refused.ok).toBe(false);

    expect(parseOptionalStaffBookingUrl("").ok).toBe(true);
    expect(parseOptionalStaffBookingUrl("https://zoom.us/sam").ok).toBe(true);
    expect(parseOptionalStaffBookingUrl("javascript:alert(1)").ok).toBe(false);
  });

  it("Schedule tasks Book the matching URL instead of the Discovery Wizard", () => {
    expect(bookingButtonLabel("training1")).toBe("Book Training 1");
    const booked = resolveTaskActionButtons({
      title: "Schedule: Workflow Guided Discovery",
      bookingUrls: URLS,
    });
    expect(booked).toEqual([
      expect.objectContaining({
        id: "book-workflowDiscovery",
        kind: "link",
        label: "Book Workflow discovery",
        href: URLS.workflowDiscovery,
        popup: true,
      }),
    ]);
    expect(booked[0]?.href).not.toBe(DISCOVERY_WIZARD_URL);

    const kickoff = resolveTaskActionButtons({
      title: "Schedule Kickoff",
      bookingUrls: { kickoff: URLS.kickoff },
    });
    expect(kickoff[0]).toMatchObject({ href: URLS.kickoff, label: "Book Kickoff" });

    const training = resolveTaskActionButtons({
      title: "Schedule Training 3",
      bookingUrls: URLS,
    });
    expect(training[0]).toMatchObject({ href: URLS.training3, label: "Book Training 3" });
  });

  it("does not invent Inbed or Storylane URLs in the resolver", () => {
    expect(resolveProjectBookingUrls({ bookingUrls: {}, zoomBookingUrl: null }).kickoff).toBeUndefined();
    expect(bookingHrefForTitle("Schedule Training 1", {})).toBeNull();
  });
});
