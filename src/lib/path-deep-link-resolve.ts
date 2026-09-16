/**
 * Resolve a `/go` deep link to a real PATH route for the signed-in actor.
 * Server-only — imports Postgres. Do not import from client components.
 */
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { phases, projects, tasks } from "@/db/schema";
import {
  ForbiddenError,
  NotFoundError,
  assertProjectAccess,
  isCustomer,
  type Actor,
} from "@/lib/authz";
import { findByPlaybookTitle, normalizeOverlapTitle } from "@/lib/playbook-meta";
import {
  inferGoDest,
  pathForAudience,
  wizardStepTaskTitles,
  type PathAudience,
  type PathDeepLinkDest,
  type PathGoQuery,
} from "@/lib/path-deep-links";
import { isCustomerVisiblePhase, isPortalFacingTask } from "@/lib/task-visibility";

export type ResolvedPathDeepLink = {
  path: string;
  audience: PathAudience;
  dest: PathDeepLinkDest;
  projectId: string;
  projectCode: string;
  taskId?: string;
  phaseId?: string;
};

type LiveTask = {
  id: string;
  title: string;
  visibility: "INTERNAL" | "SHARED";
  ownerSide: "INTERNAL" | "CUSTOMER";
  parentTaskId: string | null;
  status: string;
  notApplicable: boolean;
  phaseId: string | null;
};

type LivePhase = {
  id: string;
  name: string;
  visibility: "INTERNAL" | "SHARED";
  notApplicable: boolean;
};

function audienceFor(actor: Actor): PathAudience {
  return isCustomer(actor) ? "portal" : "staff";
}

async function findProject(query: PathGoQuery) {
  const idNeedle = query.projectId?.trim() || "";
  const codeNeedle = query.project?.trim() || "";

  if (idNeedle) {
    const byId = await db.query.projects.findFirst({
      where: and(eq(projects.id, idNeedle), isNull(projects.archivedAt)),
      columns: {
        id: true,
        code: true,
        name: true,
        customerAccountId: true,
        portalEnabled: true,
        archivedAt: true,
        leadId: true,
        crmAcronym: true,
        prismClientId: true,
      },
    });
    if (byId) return byId;
  }

  if (!codeNeedle) return null;
  const lower = codeNeedle.toLowerCase();

  const byCode = await db.query.projects.findFirst({
    where: and(eq(projects.id, codeNeedle), isNull(projects.archivedAt)),
    columns: {
      id: true,
      code: true,
      name: true,
      customerAccountId: true,
      portalEnabled: true,
      archivedAt: true,
      leadId: true,
      crmAcronym: true,
      prismClientId: true,
    },
  });
  if (byCode) return byCode;

  const rows = await db.query.projects.findMany({
    where: and(
      isNull(projects.archivedAt),
      or(
        sql`lower(${projects.code}) = ${lower}`,
        sql`lower(coalesce(${projects.crmAcronym}, '')) = ${lower}`,
        sql`lower(coalesce(${projects.prismClientId}, '')) = ${lower}`,
      ),
    ),
    columns: {
      id: true,
      code: true,
      name: true,
      customerAccountId: true,
      portalEnabled: true,
      archivedAt: true,
      leadId: true,
      crmAcronym: true,
      prismClientId: true,
    },
    limit: 8,
  });
  if (rows.length === 0) return null;
  return (
    rows.find((r) => r.code.toLowerCase() === lower) ??
    rows.find((r) => (r.crmAcronym ?? "").toLowerCase() === lower) ??
    rows.find((r) => (r.prismClientId ?? "").toLowerCase() === lower) ??
    rows[0] ??
    null
  );
}

function pickTask(
  rows: LiveTask[],
  titles: string[],
  audience: PathAudience,
): LiveTask | undefined {
  const byTitle = new Map<string, LiveTask>();
  for (const row of rows) {
    const key = normalizeOverlapTitle(row.title);
    if (!byTitle.has(key)) byTitle.set(key, row);
  }
  for (const title of titles) {
    const hit = findByPlaybookTitle(byTitle, title) ?? byTitle.get(normalizeOverlapTitle(title));
    if (!hit) continue;
    if (audience === "portal" && !isPortalFacingTask(hit)) continue;
    return hit;
  }
  if (audience === "staff") {
    for (const title of titles) {
      const hit = findByPlaybookTitle(byTitle, title) ?? byTitle.get(normalizeOverlapTitle(title));
      if (hit) return hit;
    }
  }
  return undefined;
}

function pickPhase(rows: LivePhase[], name: string, audience: PathAudience): LivePhase | undefined {
  const want = normalizeOverlapTitle(name);
  const match = (p: LivePhase) => {
    const got = normalizeOverlapTitle(p.name);
    if (got === want) return true;
    if (want === "configuration" && got.includes("configuration")) return true;
    if (want === "discovery" && got.includes("discovery")) return true;
    return got.includes(want) || want.includes(got);
  };
  const hits = rows.filter(match);
  if (audience === "portal") {
    return hits.find((p) => isCustomerVisiblePhase(p));
  }
  return hits[0];
}

function fallbackPortalPath(
  audience: PathAudience,
  projectId: string,
  phaseRows: LivePhase[],
): string {
  if (audience !== "portal") return pathForAudience("staff", { dest: "project", projectId });
  const discovery = pickPhase(phaseRows, "Discovery", "portal");
  if (discovery) {
    return pathForAudience("portal", { dest: "phase", projectId, phaseId: discovery.id });
  }
  return pathForAudience("portal", { dest: "project", projectId });
}

export async function resolvePathDeepLink(
  actor: Actor,
  query: PathGoQuery,
): Promise<ResolvedPathDeepLink> {
  const project = await findProject(query);
  if (!project) throw new NotFoundError("Project not found.");

  try {
    await assertProjectAccess(actor, project.id);
  } catch (err) {
    if (err instanceof ForbiddenError) throw new NotFoundError("Project not found.");
    throw err;
  }

  const audience = audienceFor(actor);
  const dest = inferGoDest(query);

  const [taskRows, phaseRows] = await Promise.all([
    db.query.tasks.findMany({
      where: eq(tasks.projectId, project.id),
      columns: {
        id: true,
        title: true,
        visibility: true,
        ownerSide: true,
        parentTaskId: true,
        status: true,
        notApplicable: true,
        phaseId: true,
      },
    }),
    db.query.phases.findMany({
      where: eq(phases.projectId, project.id),
      columns: { id: true, name: true, visibility: true, notApplicable: true },
    }),
  ]);

  let taskId: string | undefined;
  let phaseId: string | undefined;
  let resolvedDest: PathDeepLinkDest = dest;

  if (dest === "about" || dest === "learn" || dest === "messages") {
    const path = pathForAudience(audience, { dest, projectId: project.id });
    return {
      path,
      audience,
      dest,
      projectId: project.id,
      projectCode: project.code,
    };
  }

  if (dest === "phase" || query.phase) {
    const phase = query.phase ? pickPhase(phaseRows, query.phase, audience) : undefined;
    if (phase) {
      phaseId = phase.id;
      resolvedDest = "phase";
    } else if (audience === "portal") {
      const path = fallbackPortalPath(audience, project.id, phaseRows);
      return {
        path,
        audience,
        dest: path.includes("/phases/") ? "phase" : "project",
        projectId: project.id,
        projectCode: project.code,
        phaseId: pickPhase(phaseRows, "Discovery", "portal")?.id,
      };
    } else {
      resolvedDest = "project";
    }
  }

  if (dest === "task" || dest === "upload") {
    if (query.taskId) {
      const byId = taskRows.find((t) => t.id === query.taskId);
      if (byId && (audience === "staff" || isPortalFacingTask(byId))) {
        const phase = byId.phaseId ? phaseRows.find((p) => p.id === byId.phaseId) : undefined;
        if (audience === "portal" && phase && !isCustomerVisiblePhase(phase)) {
          /* fall through to title / step fallback */
        } else {
          taskId = byId.id;
          phaseId = byId.phaseId ?? undefined;
        }
      }
    }

    if (!taskId) {
      const titles: string[] = [];
      if (query.task) titles.push(query.task);
      titles.push(...wizardStepTaskTitles(query.step));
      const hit = pickTask(taskRows, titles, audience);
      if (hit) {
        const phase = hit.phaseId ? phaseRows.find((p) => p.id === hit.phaseId) : undefined;
        if (audience === "portal" && phase && !isCustomerVisiblePhase(phase)) {
          /* skip */
        } else {
          taskId = hit.id;
          phaseId = hit.phaseId ?? undefined;
        }
      }
    }

    if (!taskId) {
      const path = fallbackPortalPath(audience, project.id, phaseRows);
      return {
        path,
        audience,
        dest: path.includes("/phases/") ? "phase" : audience === "staff" ? "project" : "project",
        projectId: project.id,
        projectCode: project.code,
        phaseId: pickPhase(phaseRows, "Discovery", audience)?.id,
      };
    }

    resolvedDest = dest === "upload" ? "upload" : "task";
  }

  if (resolvedDest === "phase" && !phaseId && query.phase) {
    phaseId = pickPhase(phaseRows, query.phase, audience)?.id;
  }

  const path = pathForAudience(audience, {
    dest: resolvedDest,
    projectId: project.id,
    taskId,
    phaseId,
  });

  return {
    path,
    audience,
    dest: resolvedDest,
    projectId: project.id,
    projectCode: project.code,
    taskId,
    phaseId,
  };
}

/** Bearer / Power Automate expansion — both audiences, no actor. */
export async function expandPathDeepLink(query: PathGoQuery): Promise<{
  projectId: string;
  projectCode: string;
  projectName: string;
  staff: { path: string; taskId?: string; phaseId?: string };
  portal: { path: string | null; taskId?: string; phaseId?: string };
}> {
  const project = await findProject(query);
  if (!project) throw new NotFoundError("Project not found.");

  const dest = inferGoDest(query);
  const [taskRows, phaseRows] = await Promise.all([
    db.query.tasks.findMany({
      where: eq(tasks.projectId, project.id),
      columns: {
        id: true,
        title: true,
        visibility: true,
        ownerSide: true,
        parentTaskId: true,
        status: true,
        notApplicable: true,
        phaseId: true,
      },
    }),
    db.query.phases.findMany({
      where: eq(phases.projectId, project.id),
      columns: { id: true, name: true, visibility: true, notApplicable: true },
    }),
  ]);

  const staffTaskTitles: string[] = [];
  if (query.task) staffTaskTitles.push(query.task);
  staffTaskTitles.push(...wizardStepTaskTitles(query.step));

  const staffTask =
    (query.taskId ? taskRows.find((t) => t.id === query.taskId) : undefined) ??
    pickTask(taskRows, staffTaskTitles, "staff");
  const portalTask =
    (query.taskId ? taskRows.find((t) => t.id === query.taskId && isPortalFacingTask(t)) : undefined) ??
    pickTask(taskRows, staffTaskTitles, "portal");

  const staffPhase = query.phase ? pickPhase(phaseRows, query.phase, "staff") : undefined;
  const portalPhase = query.phase
    ? pickPhase(phaseRows, query.phase, "portal")
    : pickPhase(phaseRows, "Discovery", "portal");

  const staffDest: PathDeepLinkDest =
    dest === "task" || dest === "upload" ? (staffTask ? dest : staffPhase ? "phase" : "project") : dest;
  const portalDest: PathDeepLinkDest =
    dest === "task" || dest === "upload" ? (portalTask ? dest : portalPhase ? "phase" : "project") : dest;

  const staffPath = pathForAudience("staff", {
    dest: staffDest === "phase" && !staffPhase ? "project" : staffDest,
    projectId: project.id,
    taskId: staffTask?.id,
    phaseId: staffPhase?.id ?? staffTask?.phaseId ?? undefined,
  });

  let portalPath: string | null = null;
  if (project.portalEnabled) {
    portalPath = pathForAudience("portal", {
      dest: portalDest === "phase" && !portalPhase && !portalTask ? "project" : portalDest,
      projectId: project.id,
      taskId: portalTask?.id,
      phaseId: portalPhase?.id ?? (portalTask && isCustomerVisiblePhase(phaseRows.find((p) => p.id === portalTask.phaseId) ?? null) ? portalTask.phaseId ?? undefined : undefined),
    });
  }

  return {
    projectId: project.id,
    projectCode: project.code,
    projectName: project.name,
    staff: { path: staffPath, taskId: staffTask?.id, phaseId: staffPhase?.id ?? staffTask?.phaseId ?? undefined },
    portal: {
      path: portalPath,
      taskId: portalTask?.id,
      phaseId: portalPhase?.id,
    },
  };
}
