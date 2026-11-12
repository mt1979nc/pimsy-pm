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
