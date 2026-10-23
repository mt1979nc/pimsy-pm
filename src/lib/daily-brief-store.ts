/**
 * Persist one daily fact. Re-ingesting the same date replaces that date's
 * owner mix. Other dates stay. Nothing else is deleted.
 */

import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { dailyFactOwners, dailyFacts } from "@/db/schema";
import type { DailyFactDraft } from "@/lib/daily-brief";

export async function upsertDailyFact(fact: DailyFactDraft): Promise<void> {
  const now = new Date();
  await db
    .insert(dailyFacts)
    .values({
      factDate: fact.factDate,
      gap: fact.gap,
      wipShape: fact.wipShape,
      wipSites: fact.wipSites,
      overdueTasks: fact.overdueTasks,
      taskDone: fact.taskDone,
      taskTotal: fact.taskTotal,
      targetPassed: fact.targetPassed,
      openThreads: fact.openThreads,
      waitingOnPimsy: fact.waitingOnPimsy,
      waitingOnCustomer: fact.waitingOnCustomer,
      prismLoadHours: fact.prismLoadHours,
      prismCapacityHours: fact.prismCapacityHours,
      slipDays: fact.slipDays,
      zendeskOpen: fact.zendeskOpen,
      note: fact.note,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: dailyFacts.factDate,
      set: {
        gap: fact.gap,
        wipShape: fact.wipShape,
        wipSites: fact.wipSites,
        overdueTasks: fact.overdueTasks,
        taskDone: fact.taskDone,
        taskTotal: fact.taskTotal,
        targetPassed: fact.targetPassed,
        openThreads: fact.openThreads,
        waitingOnPimsy: fact.waitingOnPimsy,
        waitingOnCustomer: fact.waitingOnCustomer,
        prismLoadHours: fact.prismLoadHours,
        prismCapacityHours: fact.prismCapacityHours,
        slipDays: fact.slipDays,
        zendeskOpen: fact.zendeskOpen,
        note: fact.note,
        updatedAt: now,
      },
    });

  await db.delete(dailyFactOwners).where(eq(dailyFactOwners.factDate, fact.factDate));
  if (fact.owners.length > 0) {
    await db.insert(dailyFactOwners).values(
      fact.owners.map((owner) => ({
        factDate: fact.factDate,
        owner: owner.owner,
        team: owner.team,
        wipSites: owner.wipSites,
      })),
    );
  }
}

export async function listDailyFacts() {
  return db.query.dailyFacts.findMany({
    orderBy: [asc(dailyFacts.factDate)],
    with: { owners: true },
  });
}
