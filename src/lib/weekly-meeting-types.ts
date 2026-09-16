/**
 * Client-safe types for the weekly-meeting roster.
 * Keep Postgres / `@/db` out of this file.
 */

import type { ProjectStatus } from "@/db/schema";

export type LastSlipSummary = {
  id: string;
  days: number;
  cause: "CUSTOMER" | "PIMSY" | null;
  note: string | null;
  createdAt: Date;
  fromDate: Date;
  toDate: Date;
};

export type WeeklyMeetingSite = {
  id: string;
  name: string;
  code: string;
  acronym: string;
  status: ProjectStatus;
  health: "GREEN" | "YELLOW" | "RED";
  leadName: string | null;
  leadId: string | null;
  targetGoLiveDate: Date | null;
  daysToGoLive: number | null;
  taskCountDone: number;
  taskCountTotal: number;
  progressPct: number;
  excludeFromAnalytics: boolean;
  lastSlip: LastSlipSummary | null;
};

export const OPEN_IMPLEMENTATION_STATUSES: ProjectStatus[] = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "ON_HOLD",
  "BLOCKED",
];

export function isOpenImplementationStatus(status: string): status is ProjectStatus {
  return (OPEN_IMPLEMENTATION_STATUSES as string[]).includes(status);
}
