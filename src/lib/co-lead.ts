/**
 * Engagement owners: primary, co-lead, and an optional 3rd specialist.
 * Each assigned person has a percent. Those percents total 100.
 * An empty slot has no percent.
 *
 * Settings → People is the source of truth for Can lead when a path-config
 * row exists. The user.canLead column is the fallback.
 */

export const PERCENT_TOTAL_ERROR = "Percents must total 100.";
export const PERCENT_RANGE_ERROR = "Enter a percent from 0 to 100.";
export const DUPLICATE_PERSON_ERROR = "Each person can only be picked once.";

export function effectiveCanLead(
  userId: string,
  columnCanLead: boolean,
  people: { userId: string; canLead: boolean }[],
): boolean {
  const saved = people.find((person) => person.userId === userId);
  return saved ? saved.canLead : columnCanLead;
}

export type OwnerFields = {
  leadId: string | null;
  coLeadId: string | null;
  thirdSpecialistId: string | null;
  leadSplitPercent: number;
  coLeadSplitPercent: number;
  thirdSplitPercent: number;
  /** Primary percent, kept so older readers still see the lead's share. */
  ownerSplitPercent: number;
};

export type OwnerShareInput = {
  leadId: string | null;
  coLeadId: string | null;
  thirdSpecialistId?: string | null;
  ownerSplitPercent?: number;
  leadSplitPercent?: number | null;
  coLeadSplitPercent?: number | null;
  thirdSplitPercent?: number | null;
};

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/**
 * Rows saved before the 3rd specialist: primary gets the stored split when a
 * co-lead is set, and the co-lead gets the rest. A sole owner gets 100.
 * The 3rd specialist is empty.
 */
export function backfillOwnerShares(row: {
  coLeadId: string | null;
  ownerSplitPercent: number;
}): {
  leadSplitPercent: number;
  coLeadSplitPercent: number;
  thirdSplitPercent: number;
  thirdSpecialistId: null;
} {
  if (!row.coLeadId) {
    return { leadSplitPercent: 100, coLeadSplitPercent: 0, thirdSplitPercent: 0, thirdSpecialistId: null };
  }
  const leadSplitPercent = clampPct(row.ownerSplitPercent);
  return {
    leadSplitPercent,
    coLeadSplitPercent: 100 - leadSplitPercent,
    thirdSplitPercent: 0,
    thirdSpecialistId: null,
  };
}

export function resolveOwnerShares(input: OwnerShareInput): OwnerFields {
  const thirdSpecialistId = input.thirdSpecialistId ?? null;
  const stored =
    input.leadSplitPercent != null && input.coLeadSplitPercent != null && input.thirdSplitPercent != null
      ? {
          leadSplitPercent: clampPct(input.leadSplitPercent),
          coLeadSplitPercent: clampPct(input.coLeadSplitPercent),
          thirdSplitPercent: clampPct(input.thirdSplitPercent),
        }
      : backfillOwnerShares({
          coLeadId: input.coLeadId,
          ownerSplitPercent: input.ownerSplitPercent ?? 100,
        });
  const leadSplitPercent = input.leadId ? stored.leadSplitPercent : 0;
  const coLeadSplitPercent = input.coLeadId ? stored.coLeadSplitPercent : 0;
  const thirdSplitPercent = thirdSpecialistId ? stored.thirdSplitPercent : 0;
  return {
    leadId: input.leadId,
    coLeadId: input.coLeadId,
    thirdSpecialistId,
    leadSplitPercent,
    coLeadSplitPercent,
    thirdSplitPercent,
    ownerSplitPercent: input.leadId ? leadSplitPercent : 100,
  };
}

function parsePercent(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

/** Columns the owner form posts and the project update writes. */
export function ownerFieldsFromForm(form: {
  leadId: string;
  coLeadId: string;
  thirdSpecialistId: string;
  leadSplitPercent: string;
  coLeadSplitPercent: string;
  thirdSplitPercent: string;
}): { error: string } | { fields: OwnerFields } {
  const leadId = form.leadId.trim() || null;
  const coLeadId = form.coLeadId.trim() || null;
  const thirdSpecialistId = form.thirdSpecialistId.trim() || null;
  const ids = [leadId, coLeadId, thirdSpecialistId].filter((id): id is string => Boolean(id));
  if (new Set(ids).size !== ids.length) return { error: DUPLICATE_PERSON_ERROR };

  const leadSplitPercent = leadId ? parsePercent(form.leadSplitPercent) : 0;
  const coLeadSplitPercent = coLeadId ? parsePercent(form.coLeadSplitPercent) : 0;
  const thirdSplitPercent = thirdSpecialistId ? parsePercent(form.thirdSplitPercent) : 0;
  if (leadSplitPercent == null || coLeadSplitPercent == null || thirdSplitPercent == null) {
    return { error: PERCENT_RANGE_ERROR };
  }
  if (ids.length > 0 && leadSplitPercent + coLeadSplitPercent + thirdSplitPercent !== 100) {
    return { error: PERCENT_TOTAL_ERROR };
  }
  return {
    fields: {
      leadId,
      coLeadId,
      thirdSpecialistId,
      leadSplitPercent,
      coLeadSplitPercent,
      thirdSplitPercent,
      ownerSplitPercent: leadId ? leadSplitPercent : 100,
    },
  };
}

export function ownerFormError(formData: { get(name: string): FormDataEntryValue | null }): string | null {
  const parsed = ownerFieldsFromForm({
    leadId: String(formData.get("leadId") ?? ""),
    coLeadId: String(formData.get("coLeadId") ?? ""),
    thirdSpecialistId: String(formData.get("thirdSpecialistId") ?? ""),
    leadSplitPercent: String(formData.get("leadSplitPercent") ?? ""),
    coLeadSplitPercent: String(formData.get("coLeadSplitPercent") ?? ""),
    thirdSplitPercent: String(formData.get("thirdSplitPercent") ?? ""),
  });
  return "error" in parsed ? parsed.error : null;
}

/**
 * Hours for each assigned person. The last assigned person absorbs rounding
 * so the shares add up to the weekly total when the percents add up to 100.
 */
export function allocateOwnerHours(
  weeklyHours: number,
  owners: OwnerShareInput,
): { lead: number; coLead: number; third: number } {
  const shares = resolveOwnerShares(owners);
  const assigned = (
    [
      { key: "lead" as const, id: shares.leadId, pct: shares.leadSplitPercent },
      { key: "coLead" as const, id: shares.coLeadId, pct: shares.coLeadSplitPercent },
      { key: "third" as const, id: shares.thirdSpecialistId, pct: shares.thirdSplitPercent },
    ] as const
  ).filter((slot) => slot.id);
  const result = { lead: 0, coLead: 0, third: 0 };
  if (assigned.length === 0) return result;
  const raw = assigned.map((slot) => Math.round(((weeklyHours * slot.pct) / 100) * 10) / 10);
  const drift = Math.round((weeklyHours - raw.reduce((sum, hours) => sum + hours, 0)) * 10) / 10;
  raw[raw.length - 1] = Math.round(((raw[raw.length - 1] ?? 0) + drift) * 10) / 10;
  for (let i = 0; i < assigned.length; i++) result[assigned[i]!.key] = raw[i] ?? 0;
  return result;
}

/**
 * New Prism customers take the Prism split. An existing PATH project keeps
 * its percents and its 3rd specialist. Import must not clear either.
 */
export function prismPercentWrite(
  existing: boolean,
  split: number,
  coLeadId: string | null,
): Partial<OwnerFields> {
  if (existing) return {};
  const shares = backfillOwnerShares({ coLeadId, ownerSplitPercent: split });
  return {
    ownerSplitPercent: shares.leadSplitPercent,
    leadSplitPercent: shares.leadSplitPercent,
    coLeadSplitPercent: shares.coLeadSplitPercent,
    thirdSplitPercent: 0,
    thirdSpecialistId: null,
  };
}

export function visibleLeadOptions<T extends { id: string; canLead: boolean }>(
  rows: T[],
  keepIds: string[],
): T[] {
  const keep = new Set(keepIds);
  return rows.filter((row) => row.canLead || keep.has(row.id));
}

/**
 * Values the owner selects must mount with after Save.
 * React resets the form to the defaults the selects mounted with. A new key
 * remounts them from the saved people, so Save does not snap a dropdown back
 * to None. An id missing from the option list cannot be shown.
 */
export function ownerSelectState(
  saved: {
    leadId: string | null;
    coLeadId: string | null;
    thirdSpecialistId?: string | null;
    leadSplitPercent: number;
    coLeadSplitPercent: number;
    thirdSplitPercent: number;
  },
  optionIds: string[],
): {
  leadId: string;
  coLeadId: string;
  thirdSpecialistId: string;
  leadSplitPercent: number;
  coLeadSplitPercent: number;
  thirdSplitPercent: number;
  key: string;
} {
  const show = (id: string | null | undefined) => {
    const raw = id ?? "";
    return raw && optionIds.includes(raw) ? raw : "";
  };
  return {
    leadId: show(saved.leadId),
    coLeadId: show(saved.coLeadId),
    thirdSpecialistId: show(saved.thirdSpecialistId),
    leadSplitPercent: saved.leadSplitPercent,
    coLeadSplitPercent: saved.coLeadSplitPercent,
    thirdSplitPercent: saved.thirdSplitPercent,
    key: [
      saved.leadId ?? "",
      saved.coLeadId ?? "",
      saved.thirdSpecialistId ?? "",
      saved.leadSplitPercent,
      saved.coLeadSplitPercent,
      saved.thirdSplitPercent,
    ].join("|"),
  };
}

export function formatOwnerShares(
  people: { name: string | null; percent: number }[],
): string | null {
  const assigned = people.filter((person) => person.name?.trim());
  if (assigned.length === 0) return null;
  if (assigned.length === 1) return assigned[0]!.name!.trim();
  return assigned.map((person) => `${person.name!.trim()} ${person.percent}%`).join(" · ");
}

export function coLeadChoiceError(input: {
  leadId: string | null;
  coLeadId: string | null;
  /** The co-lead already stored, so a person who later loses Can lead is not cleared by a re-save. */
  existingCoLeadId?: string | null;
  coLead: { role: string; isActive: boolean; canLead: boolean } | null;
}): string | null {
  if (!input.coLeadId) return null;
  if (input.coLeadId === input.leadId) return "Co-lead must be a different person than the lead.";
  if (!input.coLead || input.coLead.role === "CUSTOMER") return "Choose a teammate.";
  if (!input.coLead.isActive) return "That person is inactive.";
  if (!input.coLead.canLead && input.coLeadId !== input.existingCoLeadId) {
    return "That person is not marked Can lead.";
  }
  return null;
}

/** Same rules as a co-lead, for the optional 3rd specialist. */
export function thirdSpecialistChoiceError(input: {
  thirdSpecialistId: string | null;
  existingThirdSpecialistId?: string | null;
  person: { role: string; isActive: boolean; canLead: boolean } | null;
}): string | null {
  if (!input.thirdSpecialistId) return null;
  if (!input.person || input.person.role === "CUSTOMER") return "Choose a teammate.";
  if (!input.person.isActive) return "That person is inactive.";
  if (!input.person.canLead && input.thirdSpecialistId !== input.existingThirdSpecialistId) {
    return "That person is not marked Can lead.";
  }
  return null;
}
