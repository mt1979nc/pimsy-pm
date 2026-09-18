/**
 * On workspace create (and About save), copy existing project/customer fields
 * onto Accessing Pimsy and attach Zendesk org/email search links.
 *
 * Never invent a security key, tenant URL, or Zendesk credentials.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { customerAccounts, fileAssets, projects, tasks, users } from "@/db/schema";
import { env } from "@/lib/env";
import {
  accessingPimsyFields,
  bookmarkFromCustomFields,
  bookmarkFromWebsite,
  formatAccessingPimsyDescription,
  isLiveSiteAttachmentName,
  isReplaceableAccessingPimsyDescription,
  LIVE_SITE_ATTACHMENT_NAME,
  mergeBookmarkIntoCustomFields,
  normalizeLiveSiteUrl,
  pickPracticeAcronym,
  pickSecurityKey,
  PIMSY_DESKTOP_INSTALL_URL,
  type AccessingPimsyFields,
} from "@/lib/accessing-pimsy";
import {
  isAccessingPimsyTitle,
  isZendeskCompanySetupTitle,
  isZendeskUsersToOrgTitle,
} from "@/db/dock-task-buttons";
import { zendeskSetupLinks } from "@/lib/zendesk";
import { normalizeAttachmentUrl } from "@/db/dock-default-attachments";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

export type WorkspaceAccessInput = {
  crmAcronym?: string | null;
  crmKey?: string | null;
  bookmarkUrl?: string | null;
};

export type ResolvedWorkspaceAccess = {
  fields: AccessingPimsyFields;
  crmAcronym: string | null;
  crmKey: string | null;
  bookmarkUrl: string | null;
  customFields: Record<string, string>;
  orgName: string | null;
  emails: string[];
};

export async function resolveWorkspaceAccess(opts: {
  customerAccountId?: string | null;
  form: WorkspaceAccessInput;
  existingCustomFields?: Record<string, string> | null;
  /** Create: copy acronym/key/bookmark from sibling sites when the form is blank. About save: false. */
  inheritMissing?: boolean;
}): Promise<ResolvedWorkspaceAccess> {
  const inherit = opts.inheritMissing !== false;
  let orgName: string | null = null;
  let website: string | null = null;
  let emails: string[] = [];
  let siblingAcronym: string | null = null;
  let siblingKey: string | null = null;
  let siblingBookmark: string | null = null;
  let siblingCustom: Record<string, string> = {};

  if (opts.customerAccountId) {
    const customer = await db.query.customerAccounts.findFirst({
      where: eq(customerAccounts.id, opts.customerAccountId),
      columns: { id: true, name: true, website: true },
    });
    orgName = customer?.name ?? null;
    website = customer?.website ?? null;

    const contacts = await db.query.users.findMany({
      where: and(eq(users.customerAccountId, opts.customerAccountId), eq(users.isActive, true)),
      columns: { email: true, role: true },
    });
    emails = contacts.map((c) => c.email).filter(Boolean);

    if (inherit) {
      const sibling = await db.query.projects.findFirst({
        where: and(
          eq(projects.customerAccountId, opts.customerAccountId),
          isNull(projects.archivedAt),
        ),
        columns: {
          crmAcronym: true,
          crmKey: true,
          prismClientId: true,
          customFields: true,
        },
        orderBy: (p, { desc }) => [desc(p.updatedAt)],
      });
      if (sibling) {
        siblingAcronym = pickPracticeAcronym(sibling.crmAcronym, sibling.prismClientId);
        siblingKey = pickSecurityKey(sibling.crmKey);
        siblingCustom = sibling.customFields ?? {};
        siblingBookmark = bookmarkFromCustomFields(siblingCustom);
      }
    }
  }

  const bookmarkUrl = inherit
    ? normalizeLiveSiteUrl(opts.form.bookmarkUrl) ||
      bookmarkFromCustomFields(opts.existingCustomFields) ||
      siblingBookmark ||
      bookmarkFromWebsite(website)
    : normalizeLiveSiteUrl(opts.form.bookmarkUrl) ||
      bookmarkFromCustomFields(opts.existingCustomFields);

  const crmAcronym = inherit
    ? pickPracticeAcronym(opts.form.crmAcronym) || siblingAcronym
    : pickPracticeAcronym(opts.form.crmAcronym);
  const crmKey = inherit
    ? pickSecurityKey(opts.form.crmKey) || siblingKey
    : pickSecurityKey(opts.form.crmKey);

  const customFields = mergeBookmarkIntoCustomFields(
    { ...(inherit ? siblingCustom : {}), ...(opts.existingCustomFields ?? {}) },
    bookmarkUrl,
  );

  return {
    fields: accessingPimsyFields({
      bookmarkUrl,
      acronym: crmAcronym,
      securityKey: crmKey,
    }),
    crmAcronym,
    crmKey,
    bookmarkUrl,
    customFields,
    orgName,
    emails,
  };
}

async function attachLink(
  tx: Tx,
  opts: {
    taskId: string;
    projectId: string;
    actorId: string | null;
    name: string;
    url: string;
    visibility: "INTERNAL" | "SHARED";
  },
): Promise<boolean> {
  const existing = await tx.query.fileAssets.findMany({
    where: eq(fileAssets.taskId, opts.taskId),
    columns: { id: true, kind: true, url: true, name: true },
  });
  const want = normalizeAttachmentUrl(opts.url);
  if (
    existing.some(
      (f) => f.kind === "LINK" && f.url && normalizeAttachmentUrl(f.url) === want,
    )
  ) {
    return false;
  }
  await tx.insert(fileAssets).values({
    name: opts.name,
    kind: "LINK",
    url: opts.url,
    visibility: opts.visibility,
    taskId: opts.taskId,
    projectId: opts.projectId,
    uploadedById: opts.actorId,
  });
  return true;
}

async function attachLiveSiteLink(
  tx: Tx,
  opts: {
    taskId: string;
    projectId: string;
    actorId: string | null;
    url: string;
    visibility: "INTERNAL" | "SHARED";
  },
): Promise<boolean> {
  const live = normalizeLiveSiteUrl(opts.url);
  if (!live) return false;
  const existing = await tx.query.fileAssets.findMany({
    where: eq(fileAssets.taskId, opts.taskId),
    columns: { id: true, kind: true, url: true, name: true },
  });
  const want = normalizeAttachmentUrl(live);
  const match = existing.find((f) => {
    if (f.kind !== "LINK") return false;
    if (f.url && normalizeAttachmentUrl(f.url) === want) return true;
    return isLiveSiteAttachmentName(f.name);
  });
  if (match) {
    const alreadyLive = match.url ? normalizeLiveSiteUrl(match.url) === live : false;
    if (match.name === LIVE_SITE_ATTACHMENT_NAME && alreadyLive) return false;
    await tx
      .update(fileAssets)
      .set({ name: LIVE_SITE_ATTACHMENT_NAME, url: live })
      .where(eq(fileAssets.id, match.id));
    return true;
  }
  await tx.insert(fileAssets).values({
    name: LIVE_SITE_ATTACHMENT_NAME,
    kind: "LINK",
    url: live,
    visibility: opts.visibility,
    taskId: opts.taskId,
    projectId: opts.projectId,
    uploadedById: opts.actorId,
  });
  return true;
}

export async function fillWorkspaceAccessTasks(
  tx: Tx,
  opts: {
    projectId: string;
    actorId: string | null;
    access: ResolvedWorkspaceAccess;
  },
): Promise<{ updated: number; attached: number }> {
  const rows = await tx.query.tasks.findMany({
    where: eq(tasks.projectId, opts.projectId),
    columns: { id: true, title: true, description: true, visibility: true },
  });

  const links = zendeskSetupLinks({
    orgName: opts.access.orgName,
    emails: opts.access.emails,
    extraStaffDomains: env.INTERNAL_EMAIL_DOMAINS,
  });
  const description = formatAccessingPimsyDescription(opts.access.fields);
  let updated = 0;
  let attached = 0;

  for (const row of rows) {
    if (isAccessingPimsyTitle(row.title)) {
      if (isReplaceableAccessingPimsyDescription(row.description)) {
        await tx
          .update(tasks)
          .set({ description, updatedAt: new Date() })
          .where(eq(tasks.id, row.id));
        updated += 1;
      }
      const vis = row.visibility === "INTERNAL" ? "INTERNAL" : "SHARED";
      if (
        await attachLink(tx, {
          taskId: row.id,
          projectId: opts.projectId,
          actorId: opts.actorId,
          name: "PIMSY desktop application",
          url: PIMSY_DESKTOP_INSTALL_URL,
          visibility: vis,
        })
      ) {
        attached += 1;
      }
      if (opts.access.fields.bookmarkUrl) {
        if (
          await attachLiveSiteLink(tx, {
            taskId: row.id,
            projectId: opts.projectId,
            actorId: opts.actorId,
            url: opts.access.fields.bookmarkUrl,
            visibility: vis,
          })
        ) {
          attached += 1;
        }
      }
      continue;
    }

    if (isZendeskCompanySetupTitle(row.title) && links.hasOrgQuery) {
      if (
        await attachLink(tx, {
          taskId: row.id,
          projectId: opts.projectId,
          actorId: opts.actorId,
          name: "Zendesk organization search",
          url: links.orgSetupUrl,
          visibility: "INTERNAL",
        })
      ) {
        attached += 1;
      }
      continue;
    }

    if (isZendeskUsersToOrgTitle(row.title) && links.hasEmailQuery) {
      if (
        await attachLink(tx, {
          taskId: row.id,
          projectId: opts.projectId,
          actorId: opts.actorId,
          name: "Zendesk user / email search",
          url: links.userEmailUrl,
          visibility: "INTERNAL",
        })
      ) {
        attached += 1;
      }
    }
  }

  return { updated, attached };
}
