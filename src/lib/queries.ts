import { and, eq, ne, inArray, isNull, isNotNull, lt, lte, gte, desc, asc, sql, count } from "drizzle-orm";
import { db } from "@/db";
import {
  projects,
  tasks,
  milestones,
  risks,
  users,
  customerAccounts,
  timeEntries,
  notifications,
  slipEvents,
  type ComplexityTier,
} from "@/db/schema";
import { accessibleProjectIds, type Actor } from "./authz";
import { addDays, startOfDay, differenceInCalendarDays } from "./dates";

const OPEN_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "ON_HOLD", "BLOCKED"] as const;

/** Projects visible to the actor, with the joins the list views need. */
export async function listProjects(
  actor: Actor,
  opts: { includeArchived?: boolean; status?: string; health?: string; customerId?: string } = {},
) {
  const ids = await accessibleProjectIds(actor);
  if (ids.length === 0) return [];

  const conditions = [inArray(projects.id, ids)];
  if (!opts.includeArchived) conditions.push(isNull(projects.archivedAt));
  if (opts.status) conditions.push(eq(projects.status, opts.status as never));
  if (opts.health) conditions.push(eq(projects.health, opts.health as never));
  if (opts.customerId) conditions.push(eq(projects.customerAccountId, opts.customerId));

  return db.query.projects.findMany({
    where: and(...conditions),
    orderBy: [asc(projects.targetGoLiveDate), desc(projects.updatedAt)],
    with: {
      customerAccount: { columns: { id: true, name: true, status: true } },
      lead: { columns: { id: true, name: true, image: true } },
    },
  });
}

/** Portfolio counters for the leadership dashboard. */
export async function portfolioSummary(actor: Actor) {
  const ids = await accessibleProjectIds(actor);
  if (ids.length === 0) {
    return {
      active: 0,
      atRisk: 0,
      needsAttention: 0,
      goLivesNext30: 0,
      overdueTasks: 0,
      openCustomerActions: 0,
      completedThisQuarter: 0,
    };
  }

  const scope = inArray(projects.id, ids);
  const in30 = addDays(new Date(), 30);
  const quarterStart = new Date();
  quarterStart.setMonth(Math.floor(quarterStart.getMonth() / 3) * 3, 1);
  quarterStart.setHours(0, 0, 0, 0);

  const [active] = await db
    .select({ n: count() })
    .from(projects)
    .where(and(scope, isNull(projects.archivedAt), inArray(projects.status, [...OPEN_STATUSES])));

  const [atRisk] = await db
    .select({ n: count() })
    .from(projects)
    .where(and(scope, isNull(projects.archivedAt), eq(projects.health, "RED")));

  const [needsAttention] = await db
    .select({ n: count() })
    .from(projects)
    .where(and(scope, isNull(projects.archivedAt), eq(projects.health, "YELLOW")));

  const [goLives] = await db
    .select({ n: count() })
    .from(projects)
    .where(
      and(
        scope,
        isNull(projects.archivedAt),
        inArray(projects.status, [...OPEN_STATUSES]),
        gte(projects.targetGoLiveDate, startOfDay(new Date())),
        lte(projects.targetGoLiveDate, in30),
      ),
    );

  const [overdue] = await db
    .select({ n: count() })
    .from(tasks)
    .where(
      and(
        inArray(tasks.projectId, ids),
        lt(tasks.dueDate, startOfDay(new Date())),
        ne(tasks.status, "DONE"),
        ne(tasks.status, "CANCELLED"),
      ),
    );

  const [customerActions] = await db
    .select({ n: count() })
    .from(tasks)
    .where(
      and(
        inArray(tasks.projectId, ids),
        eq(tasks.ownerSide, "CUSTOMER"),
        ne(tasks.status, "DONE"),
        ne(tasks.status, "CANCELLED"),
      ),
    );

  const [completed] = await db
    .select({ n: count() })
    .from(projects)
    .where(and(scope, eq(projects.status, "COMPLETED"), gte(projects.actualGoLiveDate, quarterStart)));

  return {
    active: active?.n ?? 0,
    atRisk: atRisk?.n ?? 0,
    needsAttention: needsAttention?.n ?? 0,
    goLivesNext30: goLives?.n ?? 0,
    overdueTasks: overdue?.n ?? 0,
    openCustomerActions: customerActions?.n ?? 0,
    completedThisQuarter: completed?.n ?? 0,
  };
}

/** Projects a leader should look at first: red, then yellow, then slipping. */
export async function attentionProjects(actor: Actor, limit = 12) {
  const ids = await accessibleProjectIds(actor);
  if (ids.length === 0) return [];

  const rows = await db.query.projects.findMany({
    where: and(
      inArray(projects.id, ids),
      isNull(projects.archivedAt),
      inArray(projects.status, [...OPEN_STATUSES]),
    ),
    with: {
      customerAccount: { columns: { id: true, name: true } },
      lead: { columns: { id: true, name: true, image: true } },
    },
  });

  const today = startOfDay(new Date());
  const scored = rows
    .map((p) => {
      let score = 0;
      if (p.health === "RED") score += 100;
      if (p.health === "YELLOW") score += 50;
      if (p.status === "BLOCKED") score += 40;
      if (p.targetGoLiveDate && new Date(p.targetGoLiveDate) < today) score += 60;
      else if (p.targetGoLiveDate) {
        const days = Math.ceil(
          (new Date(p.targetGoLiveDate).getTime() - today.getTime()) / 86_400_000,
        );
        if (days <= 14) score += 20;
      }
      const pct = p.taskCountTotal > 0 ? p.taskCountDone / p.taskCountTotal : 0;
      if (p.taskCountTotal > 0 && pct < 0.25) score += 10;
      return { ...p, score };
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
}

/** Tasks assigned to the actor across every project they can reach. */
export async function myTasks(actor: Actor) {
  return db.query.tasks.findMany({
    where: and(
      eq(tasks.assigneeId, actor.id),
      ne(tasks.status, "DONE"),
      ne(tasks.status, "CANCELLED"),
    ),
    orderBy: [asc(tasks.dueDate), desc(tasks.priority)],
    limit: 200,
    with: {
      project: {
        columns: { id: true, name: true, code: true },
        with: { customerAccount: { columns: { id: true, name: true } } },
      },
    },
  });
}

/** Everything the team is waiting on from customers — chase list. */
export async function waitingOnCustomer(actor: Actor, limit = 50) {
  const ids = await accessibleProjectIds(actor);
  if (ids.length === 0) return [];
  return db.query.tasks.findMany({
    where: and(
      inArray(tasks.projectId, ids),
      eq(tasks.ownerSide, "CUSTOMER"),
      ne(tasks.status, "DONE"),
      ne(tasks.status, "CANCELLED"),
    ),
    orderBy: [asc(tasks.dueDate)],
    limit,
    with: {
      project: {
        columns: { id: true, name: true, code: true },
        with: { customerAccount: { columns: { id: true, name: true } } },
      },
    },
  });
}

export async function upcomingMilestones(actor: Actor, days = 45, limit = 25) {
  const ids = await accessibleProjectIds(actor);
  if (ids.length === 0) return [];
  return db.query.milestones.findMany({
    where: and(
      inArray(milestones.projectId, ids),
      isNull(milestones.completedAt),
      lte(milestones.dueDate, addDays(new Date(), days)),
    ),
    orderBy: [asc(milestones.dueDate)],
    limit,
    with: {
      project: {
        columns: { id: true, name: true, code: true },
        with: { customerAccount: { columns: { id: true, name: true } } },
      },
    },
  });
}

export async function openRisks(actor: Actor, limit = 25) {
  const ids = await accessibleProjectIds(actor);
  if (ids.length === 0) return [];
  return db.query.risks.findMany({
    where: and(inArray(risks.projectId, ids), inArray(risks.status, ["OPEN", "MITIGATING"])),
    orderBy: [desc(risks.severity), asc(risks.dueDate)],
    limit,
    with: {
      project: { columns: { id: true, name: true, code: true } },
      owner: { columns: { id: true, name: true } },
    },
  });
}

/**
 * Workload per specialist: open task count, hours committed, and how that
 * compares to their declared weekly capacity.
 */
export async function teamCapacity() {
  const staff = await db.query.users.findMany({
    where: and(eq(users.isActive, true), ne(users.role, "CUSTOMER")),
    columns: { id: true, name: true, email: true, role: true, capacityHoursPerWeek: true, image: true },
    orderBy: [asc(users.name)],
  });

  const workload = await db
    .select({
      assigneeId: tasks.assigneeId,
      openTasks: count(),
      hours: sql<number>`coalesce(sum(${tasks.estimateHours}), 0)::float`,
      overdue: sql<number>`count(*) filter (where ${tasks.dueDate} < now() and ${tasks.status} not in ('DONE','CANCELLED'))::int`,
    })
    .from(tasks)
    .where(and(ne(tasks.status, "DONE"), ne(tasks.status, "CANCELLED")))
    .groupBy(tasks.assigneeId);

  const leads = await db
    .select({ leadId: projects.leadId, n: count() })
    .from(projects)
    .where(and(isNull(projects.archivedAt), inArray(projects.status, [...OPEN_STATUSES])))
    .groupBy(projects.leadId);

  const byUser = new Map(workload.map((w) => [w.assigneeId, w]));
  const leadCount = new Map(leads.map((l) => [l.leadId, l.n]));

  return staff.map((s) => {
    const w = byUser.get(s.id);
    return {
      ...s,
      openTasks: w?.openTasks ?? 0,
      committedHours: Math.round(w?.hours ?? 0),
      overdueTasks: Number(w?.overdue ?? 0),
      projectsLed: leadCount.get(s.id) ?? 0,
      utilization:
        s.capacityHoursPerWeek > 0
          ? Math.round(((w?.hours ?? 0) / s.capacityHoursPerWeek) * 100)
          : 0,
    };
  });
}

/** Median calendar days from project start to actual go-live. */
export async function cycleTimeStats() {
  const done = await db.query.projects.findMany({
    where: and(
      eq(projects.status, "COMPLETED"),
      eq(projects.type, "IMPLEMENTATION"),
    ),
    columns: { startDate: true, actualGoLiveDate: true, targetGoLiveDate: true },
    limit: 500,
  });

  const durations: number[] = [];
  let onTime = 0;
  let counted = 0;

  for (const p of done) {
    if (p.startDate && p.actualGoLiveDate) {
      durations.push(
        Math.round(
          (new Date(p.actualGoLiveDate).getTime() - new Date(p.startDate).getTime()) / 86_400_000,
        ),
      );
    }
    if (p.targetGoLiveDate && p.actualGoLiveDate) {
      counted++;
      if (new Date(p.actualGoLiveDate) <= new Date(p.targetGoLiveDate)) onTime++;
    }
  }

  durations.sort((a, b) => a - b);
  const median =
    durations.length === 0
      ? null
      : durations.length % 2 === 1
        ? durations[(durations.length - 1) / 2]
        : Math.round((durations[durations.length / 2 - 1] + durations[durations.length / 2]) / 2);

  return {
    completed: done.length,
    medianDays: median,
    onTimeRate: counted > 0 ? Math.round((onTime / counted) * 100) : null,
  };
}

export async function listCustomers() {
  const rows = await db.query.customerAccounts.findMany({
    where: isNull(customerAccounts.archivedAt),
    orderBy: [asc(customerAccounts.name)],
    with: {
      projects: {
        columns: {
          id: true,
          name: true,
          code: true,
          status: true,
          health: true,
          targetGoLiveDate: true,
          taskCountDone: true,
          taskCountTotal: true,
          archivedAt: true,
        },
      },
      contacts: {
        columns: { id: true, name: true, email: true, isActive: true, lastSeenAt: true },
      },
    },
  });
  return rows.map((c) => ({
    ...c,
    projects: c.projects.filter((p) => !p.archivedAt),
  }));
}

export async function recentNotifications(actor: Actor, limit = 20) {
  return db.query.notifications.findMany({
    where: eq(notifications.userId, actor.id),
    orderBy: [desc(notifications.createdAt)],
    limit,
  });
}

export async function hoursLoggedThisWeek(actor: Actor) {
  const weekStart = startOfDay(addDays(new Date(), -6));
  const [row] = await db
    .select({ minutes: sql<number>`coalesce(sum(${timeEntries.minutes}),0)::int` })
    .from(timeEntries)
    .where(and(eq(timeEntries.userId, actor.id), gte(timeEntries.workedOn, weekStart)));
  return Math.round(((row?.minutes ?? 0) / 60) * 10) / 10;
}

// ---------------------------------------------------------------------------
// Forward-looking capacity + forecast/analysis reporting
// (ported from PRISM's Capacity Dashboard and Analysis tab)
// ---------------------------------------------------------------------------

/**
 * Projects each active specialist's committed hours forward, week by week,
 * by spreading each open project's estimatedHours evenly across its
 * start→target-go-live window. Unlike `teamCapacity()` (a snapshot of today's
 * open-task hours), this is what answers "when does this person free up" —
 * the same question PRISM's Weekly Capacity Forecast chart answered.
 *
 * A project with no estimatedHours (not scoped, and not from the PRISM
 * import) simply doesn't contribute — this undercounts rather than guesses.
 */
export async function weeklyCapacityForecast(weeksAhead = 12) {
  const staff = await db.query.users.findMany({
    where: and(eq(users.isActive, true), ne(users.role, "CUSTOMER")),
    columns: { id: true, name: true, capacityHoursPerWeek: true },
    orderBy: [asc(users.name)],
  });

  const active = await db.query.projects.findMany({
    where: and(isNull(projects.archivedAt), inArray(projects.status, [...OPEN_STATUSES]), isNotNull(projects.leadId)),
    columns: { id: true, leadId: true, startDate: true, targetGoLiveDate: true, estimatedHours: true },
  });

  const today = startOfDay(new Date());
  const weeks = Array.from({ length: weeksAhead }, (_, i) => addDays(today, i * 7));

  const table = weeks.map((weekStart) => {
    const weekEnd = addDays(weekStart, 7);
    const perPerson = new Map<string, number>();

    for (const p of active) {
      if (!p.leadId || !p.estimatedHours) continue;
      const start = p.startDate ? new Date(p.startDate) : today;
      const end = p.targetGoLiveDate ? new Date(p.targetGoLiveDate) : addDays(start, 60);
      if (weekEnd <= start || weekStart >= end) continue; // no overlap with this project's span

      const totalWeeks = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (7 * 86_400_000)));
      const hoursThisWeek = p.estimatedHours / totalWeeks;
      perPerson.set(p.leadId, (perPerson.get(p.leadId) ?? 0) + hoursThisWeek);
    }

    return {
      weekOf: weekStart,
      byPerson: staff.map((s) => ({
        id: s.id,
        hours: Math.round((perPerson.get(s.id) ?? 0) * 10) / 10,
      })),
      totalHours: Math.round([...perPerson.values()].reduce((a, b) => a + b, 0) * 10) / 10,
    };
  });

  return { staff, weeks: table };
}

type CompletedForAnalysis = {
  id: string;
  leadId: string | null;
  leadName: string | null;
  complexityTier: ComplexityTier | null;
  startDate: Date | null;
  initialGoLiveDate: Date | null;
  actualGoLiveDate: Date | null;
  variance: number | null; // actual - initial, in days. Positive = late.
  durationDays: number | null;
};

async function completedImplementationsForAnalysis(): Promise<CompletedForAnalysis[]> {
  const rows = await db.query.projects.findMany({
    where: and(eq(projects.status, "COMPLETED"), eq(projects.type, "IMPLEMENTATION")),
    columns: { id: true, leadId: true, startDate: true, initialGoLiveDate: true, actualGoLiveDate: true },
    with: {
      lead: { columns: { id: true, name: true } },
      scope: { columns: { complexityTier: true } },
    },
  });

  return rows.map((p) => {
    const variance =
      p.initialGoLiveDate && p.actualGoLiveDate
        ? differenceInCalendarDays(new Date(p.actualGoLiveDate), new Date(p.initialGoLiveDate))
        : null;
    const durationDays =
      p.startDate && p.actualGoLiveDate
        ? differenceInCalendarDays(new Date(p.actualGoLiveDate), new Date(p.startDate))
        : null;
    return {
      id: p.id,
      leadId: p.leadId,
      leadName: p.lead?.name ?? null,
      complexityTier: p.scope?.complexityTier ?? null,
      startDate: p.startDate,
      initialGoLiveDate: p.initialGoLiveDate,
      actualGoLiveDate: p.actualGoLiveDate,
      variance,
      durationDays,
    };
  });
}

function avg(nums: number[]) {
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

/**
 * The estimator's own report card: forecast (initial go-live, set at
 * scoping/creation time) vs. what actually happened. This is the feedback
 * loop the estimator constants in src/lib/estimator.ts should eventually be
 * tuned against.
 */
export async function forecastAccuracy() {
  const rows = (await completedImplementationsForAnalysis()).filter((r) => r.variance !== null);
  const withData = rows.length;
  const onTime = rows.filter((r) => (r.variance ?? 0) <= 0).length;
  const misses = rows.filter((r) => (r.variance ?? 0) > 0);

  return {
    completed: withData,
    onTimeRate: withData > 0 ? Math.round((onTime / withData) * 100) : null,
    lateCount: misses.length,
    avgVariance: avg(rows.map((r) => r.variance!)),
    avgMissSeverity: avg(misses.map((r) => r.variance!)),
    avgDuration: avg(rows.filter((r) => r.durationDays !== null).map((r) => r.durationDays!)),
  };
}

/** On-time rate and miss severity, one row per implementation lead. */
export async function onTimeByOwner() {
  const rows = (await completedImplementationsForAnalysis()).filter(
    (r) => r.variance !== null && r.leadId,
  );
  const byOwner = new Map<string, { name: string; rows: CompletedForAnalysis[] }>();
  for (const r of rows) {
    const key = r.leadId!;
    if (!byOwner.has(key)) byOwner.set(key, { name: r.leadName ?? "Unknown", rows: [] });
    byOwner.get(key)!.rows.push(r);
  }
  return [...byOwner.entries()]
    .map(([leadId, { name, rows: rs }]) => {
      const misses = rs.filter((r) => (r.variance ?? 0) > 0);
      return {
        leadId,
        name,
        completed: rs.length,
        onTimeRate: Math.round(((rs.length - misses.length) / rs.length) * 100),
        avgVariance: avg(rs.map((r) => r.variance!)),
        avgDaysLateOnMisses: avg(misses.map((r) => r.variance!)),
        misses: misses.length,
      };
    })
    .sort((a, b) => b.onTimeRate - a.onTimeRate);
}

/** On-time rate and average duration/variance, one row per complexity tier. */
export async function onTimeByComplexityTier() {
  const rows = (await completedImplementationsForAnalysis()).filter(
    (r) => r.variance !== null && r.complexityTier,
  );
  const tiers: ComplexityTier[] = ["STANDARD", "MODERATE", "HIGH", "ENTERPRISE"];
  return tiers
    .map((tier) => {
      const rs = rows.filter((r) => r.complexityTier === tier);
      if (rs.length === 0) return null;
      const misses = rs.filter((r) => (r.variance ?? 0) > 0);
      return {
        tier,
        n: rs.length,
        onTimeRate: Math.round(((rs.length - misses.length) / rs.length) * 100),
        avgDuration: avg(rs.filter((r) => r.durationDays !== null).map((r) => r.durationDays!)),
        avgVariance: avg(rs.map((r) => r.variance!)),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

/**
 * Every go-live push, tagged (or not) at the moment it happened. Slip days
 * attributed to the customer vs. to PIMSY, overall and per owner — the same
 * split PRISM's Analysis tab showed. `untagged` surfaces slips nobody has
 * assigned a cause to yet, so the split doesn't quietly look more complete
 * than the tagging discipline behind it actually is.
 */
export async function slipAttribution() {
  const rows = await db.query.slipEvents.findMany({
    with: {
      project: {
        columns: { id: true, code: true, leadId: true },
        with: { lead: { columns: { id: true, name: true } } },
      },
    },
    orderBy: [desc(slipEvents.createdAt)],
  });

  let customerDays = 0;
  let pimsyDays = 0;
  let untaggedDays = 0;
  let untaggedCount = 0;
  const byOwner = new Map<
    string,
    { name: string; events: number; customerDays: number; pimsyDays: number }
  >();

  for (const r of rows) {
    const days = Math.abs(r.days);
    if (r.cause === "CUSTOMER") customerDays += days;
    else if (r.cause === "PIMSY") pimsyDays += days;
    else {
      untaggedDays += days;
      untaggedCount++;
    }

    const leadId = r.project.leadId;
    if (leadId) {
      const key = leadId;
      if (!byOwner.has(key)) {
        byOwner.set(key, { name: r.project.lead?.name ?? "Unknown", events: 0, customerDays: 0, pimsyDays: 0 });
      }
      const o = byOwner.get(key)!;
      o.events++;
      if (r.cause === "CUSTOMER") o.customerDays += days;
      if (r.cause === "PIMSY") o.pimsyDays += days;
    }
  }

  return {
    events: rows.length,
    totalDays: customerDays + pimsyDays + untaggedDays,
    customerDays,
    pimsyDays,
    untaggedDays,
    untaggedCount,
    byOwner: [...byOwner.values()].sort((a, b) => b.events - a.events),
  };
}
