/**
 * Client-safe About / kickoff / CRM helpers.
 *
 * About mirrors kickoff logistics (dates, booking, kickoff-phase status) and
 * live contact cards. Custom-field keys that duplicate first-class columns are
 * stripped so staff are not maintaining the same value twice. Never import
 * `@/db` from here — client About forms may import this module.
 */
import { staffingRoleLabel, staffingRoleRank } from "@/lib/staffing";

export type AboutContactKind = "implementation" | "customer";

export type AboutContactInput = {
  id: string;
  name: string | null;
  email: string;
  title?: string | null;
  phone?: string | null;
  image?: string | null;
  isActive?: boolean;
  memberRole?: string | null;
  staffingRole?: string | null;
  userRole?: string | null;
  onProject?: boolean;
};

export type AboutContactCard = {
  id: string;
  name: string;
  email: string;
  title: string | null;
  phone: string | null;
  image: string | null;
  roleLabel: string;
  kind: AboutContactKind;
  isActive: boolean;
  onProject: boolean;
};

export type KickoffSnapshotItem = {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  visibility: "INTERNAL" | "SHARED";
};

export type KickoffSnapshot = {
  phaseName: string | null;
  phaseVisibility: "INTERNAL" | "SHARED" | null;
  items: KickoffSnapshotItem[];
};

export type PortalAboutPayload = {
  projectName: string;
  customerName: string | null;
  crmAcronym: string | null;
  liveSiteUrl: string | null;
  kickoffDate: string | null;
  goLiveDate: string | null;
  zoomBookingUrl: string | null;
  bookingUrls?: unknown;
  aboutNotes: string | null;
  hasRcm?: boolean;
  kickoff: KickoffSnapshot;
  implementationTeam: AboutContactCard[];
  customerContacts: AboutContactCard[];
};

/** Keys that duplicate dedicated About / kickoff columns — do not keep as extras. */
const RESERVED_CUSTOM_FIELD_KEYS = new Set([
  "hubspot",
  "hubspotdeal",
  "hubspotdealurl",
  "deal",
  "dealurl",
  "dealid",
  "prism",
  "prismclient",
  "prismclientid",
  "prismid",
  "crm",
  "crmacronym",
  "crmkey",
  "acronym",
  "key",
  "zoom",
  "zoombooking",
  "zoombookingurl",
  "booking",
  "bookingurl",
  "inbed",
  "inbedbookings",
  "onboarded",
  "notes",
  "aboutnotes",
  "about",
  "bookmark",
  "crmlink",
  "pimsyurl",
  "pimsybookmark",
  "crmbookmark",
]);

export function normalizeCustomFieldKey(key: string): string {
  return key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function isReservedCustomFieldKey(key: string): boolean {
  return RESERVED_CUSTOM_FIELD_KEYS.has(normalizeCustomFieldKey(key));
}

export function parseCustomFieldLines(raw: string): Record<string, string> {
  const customFields: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!key || !value) continue;
    if (isReservedCustomFieldKey(key)) continue;
    customFields[key] = value;
  }
  return customFields;
}

export function extraCustomFields(
  fields: Record<string, string> | null | undefined,
): Array<{ key: string; value: string }> {
  const out: Array<{ key: string; value: string }> = [];
  for (const [key, value] of Object.entries(fields ?? {})) {
    const trimmedKey = key.trim();
    const trimmedValue = value.trim();
    if (!trimmedKey || !trimmedValue) continue;
    if (isReservedCustomFieldKey(trimmedKey)) continue;
    out.push({ key: trimmedKey, value: trimmedValue });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

export function customFieldsAsLines(fields: Record<string, string> | null | undefined): string {
  return extraCustomFields(fields)
    .map(({ key, value }) => `${key}=${value}`)
    .join("\n");
}

export function isKickoffPhaseName(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.trim().toLowerCase();
  return n === "kickoff" || n.endsWith(" kickoff") || n === "pre-kickoff";
}

export function portalKickoffItems(items: KickoffSnapshotItem[]): KickoffSnapshotItem[] {
  return items.filter((item) => item.visibility === "SHARED");
}

export function isKickoffPhaseVisibleToPortal(snapshot: KickoffSnapshot): boolean {
  return snapshot.phaseVisibility === "SHARED";
}

function displayName(input: AboutContactInput): string {
  const name = input.name?.trim();
  return name || input.email;
}

function implementationRoleLabel(input: AboutContactInput): string {
  if (input.memberRole && input.memberRole !== "CUSTOMER_CONTACT") {
    return staffingRoleLabel(input.memberRole);
  }
  if (input.staffingRole) return staffingRoleLabel(input.staffingRole);
  if (input.title?.trim()) return input.title.trim();
  return "Implementation team";
}

export function implementationTeamCards(people: AboutContactInput[]): AboutContactCard[] {
  const byId = new Map<string, AboutContactInput>();
  for (const person of people) {
    if (!person.id) continue;
    if (person.userRole === "CUSTOMER") continue;
    const existing = byId.get(person.id);
    if (!existing) {
      byId.set(person.id, { ...person, onProject: person.onProject ?? true });
      continue;
    }
    const rank = staffingRoleRank(person.memberRole);
    const existingRank = staffingRoleRank(existing.memberRole);
    if (rank < existingRank) {
      byId.set(person.id, { ...existing, ...person, onProject: true });
    } else {
      byId.set(person.id, {
        ...existing,
        title: existing.title || person.title,
        phone: existing.phone || person.phone,
        image: existing.image || person.image,
        onProject: true,
      });
    }
  }

  return [...byId.values()]
    .map((person) => ({
      id: person.id,
      name: displayName(person),
      email: person.email,
      title: person.title?.trim() || null,
      phone: person.phone?.trim() || null,
      image: person.image ?? null,
      roleLabel: implementationRoleLabel(person),
      kind: "implementation" as const,
      isActive: person.isActive !== false,
      onProject: person.onProject !== false,
      sortRank: staffingRoleRank(person.memberRole ?? person.staffingRole),
    }))
    .filter((card) => card.isActive)
    .sort((a, b) => (a.sortRank !== b.sortRank ? a.sortRank - b.sortRank : a.name.localeCompare(b.name)))
    .map(({ sortRank: _rank, ...card }) => card);
}

export function customerContactCards(people: AboutContactInput[]): AboutContactCard[] {
  return people
    .filter((person) => person.userRole === "CUSTOMER" || person.memberRole === "CUSTOMER_CONTACT")
    .map((person) => ({
      id: person.id,
      name: displayName(person),
      email: person.email,
      title: person.title?.trim() || null,
      phone: person.phone?.trim() || null,
      image: person.image ?? null,
      roleLabel: person.title?.trim() || "Practice contact",
      kind: "customer" as const,
      isActive: person.isActive !== false,
      onProject: person.onProject !== false,
    }))
    .sort((a, b) => {
      if (a.onProject !== b.onProject) return a.onProject ? -1 : 1;
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

export function portalCustomerContactCards(people: AboutContactInput[]): AboutContactCard[] {
  return customerContactCards(people).filter((card) => card.isActive && card.onProject);
}

export function isoDateOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function toPortalAbout(input: {
  projectName: string;
  customerName: string | null;
  crmAcronym: string | null;
  liveSiteUrl?: string | null;
  kickoffDate: Date | string | null;
  goLiveDate: Date | string | null;
  zoomBookingUrl: string | null;
  bookingUrls?: unknown;
  aboutNotes: string | null;
  hasRcm?: boolean;
  kickoff: KickoffSnapshot;
  implementationTeam: AboutContactCard[];
  customerContacts: AboutContactInput[];
}): PortalAboutPayload {
  const kickoffItems = isKickoffPhaseVisibleToPortal(input.kickoff)
    ? portalKickoffItems(input.kickoff.items)
    : [];
  return {
    projectName: input.projectName,
    customerName: input.customerName,
    crmAcronym: input.crmAcronym,
    liveSiteUrl: input.liveSiteUrl ?? null,
    kickoffDate: isoDateOrNull(input.kickoffDate),
    goLiveDate: isoDateOrNull(input.goLiveDate),
    zoomBookingUrl: input.zoomBookingUrl,
    bookingUrls: input.bookingUrls,
    aboutNotes: input.aboutNotes,
    hasRcm: Boolean(input.hasRcm),
    kickoff: {
      phaseName: isKickoffPhaseVisibleToPortal(input.kickoff) ? input.kickoff.phaseName : null,
      phaseVisibility: input.kickoff.phaseVisibility,
      items: kickoffItems,
    },
    implementationTeam: input.implementationTeam.filter((c) => c.isActive),
    customerContacts: portalCustomerContactCards(input.customerContacts),
  };
}

export function portalAboutHasContent(payload: PortalAboutPayload): boolean {
  return Boolean(
    payload.crmAcronym ||
      payload.liveSiteUrl ||
      payload.kickoffDate ||
      payload.goLiveDate ||
      payload.zoomBookingUrl ||
      payload.aboutNotes ||
      payload.hasRcm ||
      payload.kickoff.items.length > 0 ||
      payload.implementationTeam.length > 0 ||
      payload.customerContacts.length > 0,
  );
}
