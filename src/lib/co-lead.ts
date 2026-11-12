/**
 * Who may be saved as a project co-lead.
 * Settings → People is the source of truth when a path-config row exists.
 * The user.canLead column is the fallback.
 */

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
  ownerSplitPercent: number;
};

/** Columns the Roster edit form posts and `projects` update writes. */
export function ownerFieldsFromForm(form: {
  leadId: string;
  coLeadId: string;
  ownerSplitPercent: string;
}): { error: string } | { fields: OwnerFields } {
  const ownerSplitPercent = Number.parseInt(form.ownerSplitPercent, 10);
  if (!Number.isFinite(ownerSplitPercent) || ownerSplitPercent < 1 || ownerSplitPercent > 100) {
    return { error: "Owner split must be 1–100." };
  }
  return {
    fields: {
      leadId: form.leadId.trim() || null,
      coLeadId: form.coLeadId.trim() || null,
      ownerSplitPercent,
    },
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
 * Value the Co-lead `<select>` must mount with after Save.
 * The action succeeds and revalidates, then React resets the form to the
 * default the select mounted with. For a site that had no co-lead, that
 * default is None, so the green Saved banner shows beside an empty dropdown
 * even though `co_lead_id` was written. A new key remounts the select from
 * the saved id. An id that is not in the option list cannot be shown.
 */
export function ownerSelectState(
  saved: OwnerFields,
  optionIds: string[],
): { leadId: string; coLeadId: string; ownerSplitPercent: number; key: string } {
  const leadId = saved.leadId ?? "";
  const rawCoLeadId = saved.coLeadId ?? "";
  const coLeadId = rawCoLeadId && optionIds.includes(rawCoLeadId) ? rawCoLeadId : "";
  return {
    leadId,
    coLeadId,
    ownerSplitPercent: saved.ownerSplitPercent,
    key: `${leadId}|${rawCoLeadId}|${saved.ownerSplitPercent}`,
  };
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
