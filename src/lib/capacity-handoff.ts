/**
 * Optional date that takes a live site off the Team capacity tiles.
 * `supportHandoffAt` is the playbook "Hand off to Support" stamp (#85 list
 * toggle). It is not this date: that stamp also completes the project and
 * sends mail, and clearing it is not how capacity is restored.
 *
 * A handoff on today or earlier drops the site. A future date does not.
 * Clearing the date puts the site back.
 */

import { utcDayKey } from "@/lib/dates";

export function isRemovedFromCapacity(
  handoffOn: Date | string | null | undefined,
  asOf: Date,
): boolean {
  if (handoffOn == null || handoffOn === "") return false;
  const day = handoffOn instanceof Date ? utcDayKey(handoffOn) : String(handoffOn).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  return day <= utcDayKey(asOf);
}
