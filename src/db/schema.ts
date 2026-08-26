/**
 * PIMSY Implementation & Project Management Platform — database schema
 * ---------------------------------------------------------------------------
 * This system holds NO PHI. It tracks implementation logistics, configuration
 * checklists, training schedules and correspondence only.
 *
 * `visibility` is the single safety boundary between internal work and what a
 * customer contact can see. Every customer-facing query must filter on it.
 * Enforcement lives in src/lib/authz.ts — do not hand-roll portal queries.
 */

import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  integer,
  boolean,
  real,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createId } from "@/lib/id";

// ===========================================================================
// ENUMS
// ===========================================================================

export const roleEnum = pgEnum("role", [
  "OWNER", // full control including settings
  "ADMIN", // manage users, templates, all projects
  "MANAGER", // COO / director: read-all + portfolio reporting
  "SPECIALIST", // implementation specialist: owns projects
  "MEMBER", // internal contributor, assigned projects only
  "CUSTOMER", // external customer contact — portal only
]);

export const customerStatusEnum = pgEnum("customer_status", [
  "PROSPECT",
  "ONBOARDING",
  "LIVE",
  "AT_RISK",
  "CHURNED",
]);

export const projectTypeEnum = pgEnum("project_type", [
  "IMPLEMENTATION",
  "MIGRATION",
  "TRAINING",
  "SUPPORT",
  "INTERNAL",
]);

export const projectStatusEnum = pgEnum("project_status", [
  "NOT_STARTED",
  "IN_PROGRESS",
  "ON_HOLD",
  "BLOCKED",
  "COMPLETED",
  "CANCELLED",
]);

export const healthEnum = pgEnum("health", ["GREEN", "YELLOW", "RED"]);

export const phaseStatusEnum = pgEnum("phase_status", [
  "NOT_STARTED",
  "IN_PROGRESS",
  "COMPLETED",
  "SKIPPED",
]);

export const taskStatusEnum = pgEnum("task_status", [
  "TODO",
  "IN_PROGRESS",
  "BLOCKED",
  "IN_REVIEW",
  "DONE",
  "CANCELLED",
]);

export const priorityEnum = pgEnum("priority", ["LOW", "MEDIUM", "HIGH", "URGENT"]);

/** The safety boundary. INTERNAL is never exposed through the portal. */
export const visibilityEnum = pgEnum("visibility", ["INTERNAL", "SHARED"]);

/** Which side of the engagement is responsible for a task. */
export const ownerSideEnum = pgEnum("owner_side", ["INTERNAL", "CUSTOMER"]);

export const projectMemberRoleEnum = pgEnum("project_member_role", [
  "LEAD",
  "CONTRIBUTOR",
  "OBSERVER",
  "CUSTOMER_CONTACT",
]);

export const riskSeverityEnum = pgEnum("risk_severity", ["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

export const riskStatusEnum = pgEnum("risk_status", [
  "OPEN",
  "MITIGATING",
  "RESOLVED",
  "ACCEPTED",
]);

/**
 * How large/involved an implementation is, computed from its scope (users,
 * locations, config hours) at the time it's scoped. Ported from PRISM.
 */
export const complexityTierEnum = pgEnum("complexity_tier", [
  "STANDARD",
  "MODERATE",
  "HIGH",
  "ENTERPRISE",
]);

/** Which forecast scenario was used to set the initial go-live commitment. */
export const discoveryScenarioEnum = pgEnum("discovery_scenario", [
  "OPTIMISTIC",
  "TYPICAL",
  "PESSIMISTIC",
]);

/** Who a schedule slip is attributed to. Null until someone tags it. */
export const slipCauseEnum = pgEnum("slip_cause", ["CUSTOMER", "PIMSY"]);

/** What an attachment on a task, project or message actually is. */
export const assetKindEnum = pgEnum("asset_kind", ["FILE", "IMAGE", "LINK"]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "TASK_ASSIGNED",
  "TASK_DUE_SOON",
  "TASK_OVERDUE",
  "MESSAGE_POSTED",
  "MENTIONED",
  "MILESTONE_COMPLETED",
  "PROJECT_HEALTH_CHANGED",
  "STATUS_UPDATE_PUBLISHED",
  "RISK_RAISED",
  "TASK_COMMENTED",
  "TASK_COMPLETED",
  "FILE_UPLOADED",
]);

// ===========================================================================
// CUSTOMERS
// ===========================================================================

export const customerAccounts = pgTable(
  "customer_account",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    status: customerStatusEnum("status").notNull().default("ONBOARDING"),
    practiceType: text("practice_type"),
    seatCount: integer("seat_count"),
    priorSystem: text("prior_system"),
    website: text("website"),
    phone: text("phone"),
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    city: text("city"),
    state: text("state"),
    postalCode: text("postal_code"),
    /** Internal-only. Never exposed via the portal. */
    internalNotes: text("internal_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("customer_account_slug_idx").on(t.slug),
    index("customer_account_status_idx").on(t.status),
  ],
);

// ===========================================================================
// PEOPLE  (users table doubles as the Auth.js user table)
// ===========================================================================

export const users = pgTable(
  "user",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    name: text("name"),
    email: text("email").notNull(),
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    image: text("image"),

    role: roleEnum("role").notNull().default("MEMBER"),
    title: text("title"),
    phone: text("phone"),
    timeZone: text("time_zone").notNull().default("America/Chicago"),
    isActive: boolean("is_active").notNull().default(true),

    /** Set for CUSTOMER users. Hard-scopes everything they can reach. */
    customerAccountId: text("customer_account_id").references(() => customerAccounts.id, {
      onDelete: "cascade",
    }),

    /** Weekly capacity in hours, used by the workload/capacity report. */
    capacityHoursPerWeek: integer("capacity_hours_per_week").notNull().default(30),

    /**
     * Optional email+password login, alongside magic-link and Google.
     * Null until the person sets one (via "Forgot password?" or Settings) —
     * most users go on using magic links and never touch this. bcrypt hash,
     * never the plaintext. See src/lib/password.ts.
     */
    passwordHash: text("password_hash"),

    /**
     * Per-person alert preferences. Null means "use the org defaults".
     * Shape: { emailEnabled: boolean, types: { [NotificationType]: boolean } }
     */
    notificationPrefs: jsonb("notification_prefs").$type<NotificationPrefs>(),

    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("user_email_idx").on(t.email),
    index("user_customer_account_idx").on(t.customerAccountId),
    index("user_role_idx").on(t.role),
  ],
);

// ===========================================================================
// AUTH.JS TABLES
// ===========================================================================

export const accounts = pgTable(
  "account",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<"oauth" | "oidc" | "email" | "webauthn">().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.providerAccountId] }),
    index("account_user_idx").on(t.userId),
  ],
);

export const sessions = pgTable(
  "session",
  {
    sessionToken: text("session_token").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const verificationTokens = pgTable(
  "verification_token",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

/**
 * "Forgot password" / "set a password" tokens. Separate from Auth.js's own
 * verification_token table (that one is magic-link-only and keyed by
 * identifier+token, not by user) so this can carry its own expiry/single-use
 * bookkeeping without touching Auth.js's adapter internals.
 *
 * The token itself is never stored — only a sha256 of it (tokenHash) — so a
 * leaked database row can't be used to reset anyone's password. See
 * src/lib/password.ts.
 */
export const passwordResetTokens = pgTable(
  "password_reset_token",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("password_reset_token_user_idx").on(t.userId),
    uniqueIndex("password_reset_token_hash_idx").on(t.tokenHash),
  ],
);

// ===========================================================================
// TEMPLATES — the PIMSY implementation playbook, standardized
// ===========================================================================

export const projectTemplates = pgTable(
  "project_template",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    name: text("name").notNull(),
    description: text("description"),
    type: projectTypeEnum("type").notNull().default("IMPLEMENTATION"),
    isActive: boolean("is_active").notNull().default(true),
    /** Typical duration in days, used to propose a go-live date. */
    durationDays: integer("duration_days").notNull().default(60),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("project_template_active_idx").on(t.isActive, t.type)],
);

export const templatePhases = pgTable(
  "template_phase",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    templateId: text("template_id")
      .notNull()
      .references(() => projectTemplates.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    order: integer("order").notNull().default(0),
    visibility: visibilityEnum("visibility").notNull().default("SHARED"),
    /** Days from project start when this phase begins. */
    offsetDays: integer("offset_days").notNull().default(0),
    durationDays: integer("duration_days").notNull().default(7),
  },
  (t) => [index("template_phase_order_idx").on(t.templateId, t.order)],
);

export const templateTasks = pgTable(
  "template_task",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    phaseId: text("phase_id")
      .notNull()
      .references(() => templatePhases.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    order: integer("order").notNull().default(0),
    priority: priorityEnum("priority").notNull().default("MEDIUM"),
    visibility: visibilityEnum("visibility").notNull().default("INTERNAL"),
    ownerSide: ownerSideEnum("owner_side").notNull().default("INTERNAL"),
    /** Days from phase start. */
    offsetDays: integer("offset_days").notNull().default(0),
    durationDays: integer("duration_days").notNull().default(1),
    estimateHours: real("estimate_hours"),
  },
  (t) => [index("template_task_order_idx").on(t.phaseId, t.order)],
);

export const templateMilestones = pgTable(
  "template_milestone",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    templateId: text("template_id")
      .notNull()
      .references(() => projectTemplates.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    order: integer("order").notNull().default(0),
    offsetDays: integer("offset_days").notNull().default(0),
    visibility: visibilityEnum("visibility").notNull().default("SHARED"),
    isGoLive: boolean("is_go_live").notNull().default(false),
  },
  (t) => [index("template_milestone_order_idx").on(t.templateId, t.order)],
);

// ===========================================================================
// PROJECTS
// ===========================================================================

export const projects = pgTable(
  "project",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    name: text("name").notNull(),
    /** Human-friendly reference, e.g. IMP-0042. */
    code: text("code").notNull(),
    description: text("description"),

    type: projectTypeEnum("type").notNull().default("IMPLEMENTATION"),
    status: projectStatusEnum("status").notNull().default("NOT_STARTED"),
    health: healthEnum("health").notNull().default("GREEN"),

    /** Null for INTERNAL projects. */
    customerAccountId: text("customer_account_id").references(() => customerAccounts.id, {
      onDelete: "cascade",
    }),
    leadId: text("lead_id").references((): AnyPgColumn => users.id, { onDelete: "set null" }),

    startDate: timestamp("start_date", { withTimezone: true }),
    /**
     * The go-live date first committed to, at scoping/creation time. Set once
     * and not touched by the normal edit flow — this is what "on time" is
     * measured against. Null for projects created before this existed or that
     * were never scoped.
     */
    initialGoLiveDate: timestamp("initial_go_live_date", { withTimezone: true }),
    /** The current target. Can move — every move that changes this from a
     * prior non-null value logs a `slip_event`. */
    targetGoLiveDate: timestamp("target_go_live_date", { withTimezone: true }),
    actualGoLiveDate: timestamp("actual_go_live_date", { withTimezone: true }),
    estimatedHours: integer("estimated_hours"),

    portalEnabled: boolean("portal_enabled").notNull().default(true),
    portalWelcomeMessage: text("portal_welcome_message"),

    /** Optional per-project Teams channel. Falls back to the org-wide one. */
    teamsWebhookUrl: text("teams_webhook_url"),

    /** Denormalized counters kept fresh by src/lib/rollup.ts. */
    taskCountTotal: integer("task_count_total").notNull().default(0),
    taskCountDone: integer("task_count_done").notNull().default(0),

    templateId: text("template_id").references(() => projectTemplates.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("project_code_idx").on(t.code),
    index("project_customer_idx").on(t.customerAccountId),
    index("project_lead_idx").on(t.leadId),
    index("project_status_idx").on(t.status),
    index("project_health_idx").on(t.health),
    index("project_go_live_idx").on(t.targetGoLiveDate),
  ],
);

/**
 * The Forecast+ scoping record for a project — what was known about the
 * implementation when it was estimated. One row per project, optional: a
 * blank/template-only project has none. Ported from PRISM's Forecast+.
 */
export const projectScopes = pgTable("project_scope", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  userCount: integer("user_count").notNull().default(1),
  locationCount: integer("location_count").notNull().default(1),
  formPageCount: integer("form_page_count").notNull().default(25),
  trainingsPerWeek: integer("trainings_per_week").notNull().default(2),
  /** Service line keys, e.g. ["OUTPATIENT_THERAPY", "MEDICATION_MANAGEMENT"]. */
  serviceLines: jsonb("service_lines").$type<string[]>().notNull().default([]),
  stateCompliance: boolean("state_compliance").notNull().default(false),
  minimalOrgStructure: boolean("minimal_org_structure").notNull().default(false),
  complexityTier: complexityTierEnum("complexity_tier").notNull().default("STANDARD"),
  /** Total estimated staff hours from the estimator at scoping time. */
  estimatedHours: real("estimated_hours"),
  /** Which scenario's date was chosen as the initial go-live commitment. */
  discoveryScenario: discoveryScenarioEnum("discovery_scenario").notNull().default("TYPICAL"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One row every time a project's targetGoLiveDate moves after it already had
 * a value. `cause` is nullable — tagging is prompted for but skippable, same
 * as PRISM's v6.4 behavior. Untagged events should be surfaced, not hidden.
 */
export const slipEvents = pgTable(
  "slip_event",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    fromDate: timestamp("from_date", { withTimezone: true }).notNull(),
    toDate: timestamp("to_date", { withTimezone: true }).notNull(),
    days: integer("days").notNull(),
    cause: slipCauseEnum("cause"),
    note: text("note"),
    createdById: text("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("slip_event_project_idx").on(t.projectId, t.createdAt),
    index("slip_event_cause_idx").on(t.cause),
  ],
);

export const projectMembers = pgTable(
  "project_member",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: projectMemberRoleEnum("role").notNull().default("CONTRIBUTOR"),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("project_member_unique_idx").on(t.projectId, t.userId),
    index("project_member_user_idx").on(t.userId),
  ],
);

export const phases = pgTable(
  "phase",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    order: integer("order").notNull().default(0),
    status: phaseStatusEnum("status").notNull().default("NOT_STARTED"),
    visibility: visibilityEnum("visibility").notNull().default("SHARED"),
    startDate: timestamp("start_date", { withTimezone: true }),
    dueDate: timestamp("due_date", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("phase_project_order_idx").on(t.projectId, t.order)],
);

export const tasks = pgTable(
  "task",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    phaseId: text("phase_id").references(() => phases.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),

    status: taskStatusEnum("status").notNull().default("TODO"),
    priority: priorityEnum("priority").notNull().default("MEDIUM"),
    visibility: visibilityEnum("visibility").notNull().default("INTERNAL"),
    /** CUSTOMER tasks surface as action items in the portal. */
    ownerSide: ownerSideEnum("owner_side").notNull().default("INTERNAL"),

    assigneeId: text("assignee_id").references((): AnyPgColumn => users.id, {
      onDelete: "set null",
    }),
    createdById: text("created_by_id").references((): AnyPgColumn => users.id, {
      onDelete: "set null",
    }),

    startDate: timestamp("start_date", { withTimezone: true }),
    dueDate: timestamp("due_date", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    estimateHours: real("estimate_hours"),
    order: integer("order").notNull().default(0),

    parentTaskId: text("parent_task_id").references((): AnyPgColumn => tasks.id, {
      onDelete: "cascade",
    }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("task_project_status_idx").on(t.projectId, t.status),
    index("task_assignee_status_idx").on(t.assigneeId, t.status),
    index("task_due_idx").on(t.dueDate),
    index("task_phase_order_idx").on(t.phaseId, t.order),
    index("task_visibility_idx").on(t.visibility),
    index("task_owner_side_idx").on(t.ownerSide, t.status),
  ],
);

export const taskDependencies = pgTable(
  "task_dependency",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    predecessorId: text("predecessor_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    successorId: text("successor_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("task_dependency_unique_idx").on(t.predecessorId, t.successorId),
    index("task_dependency_successor_idx").on(t.successorId),
  ],
);

export const taskComments = pgTable(
  "task_comment",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    visibility: visibilityEnum("visibility").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("task_comment_task_idx").on(t.taskId, t.createdAt)],
);

export const milestones = pgTable(
  "milestone",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    visibility: visibilityEnum("visibility").notNull().default("SHARED"),
    isGoLive: boolean("is_go_live").notNull().default(false),
    order: integer("order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("milestone_project_order_idx").on(t.projectId, t.order),
    index("milestone_due_idx").on(t.dueDate),
  ],
);

export const risks = pgTable(
  "risk",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    severity: riskSeverityEnum("severity").notNull().default("MEDIUM"),
    status: riskStatusEnum("status").notNull().default("OPEN"),
    /** Risks default to INTERNAL. Sharing one is a deliberate act. */
    visibility: visibilityEnum("visibility").notNull().default("INTERNAL"),
    ownerId: text("owner_id").references(() => users.id, { onDelete: "set null" }),
    dueDate: timestamp("due_date", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("risk_project_status_idx").on(t.projectId, t.status),
    index("risk_severity_idx").on(t.severity, t.status),
  ],
);

/** Periodic customer-facing status report. Replaces the "where are we?" email. */
export const statusUpdates = pgTable(
  "status_update",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    summary: text("summary").notNull(),
    accomplished: text("accomplished"),
    upcoming: text("upcoming"),
    needsFromYou: text("needs_from_you"),
    health: healthEnum("health").notNull().default("GREEN"),
    visibility: visibilityEnum("visibility").notNull().default("SHARED"),
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("status_update_project_idx").on(t.projectId, t.publishedAt)],
);

// ===========================================================================
// MESSAGING
// ===========================================================================

/**
 * A conversation. `visibility` decides whether customer contacts can see it at
 * all. An INTERNAL thread on a customer project is the team's back channel —
 * this is the thing Dock cannot do.
 */
export const messageThreads = pgTable(
  "message_thread",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    subject: text("subject").notNull(),
    visibility: visibilityEnum("visibility").notNull().default("INTERNAL"),

    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    /** Set for account-level threads not tied to a single project. */
    customerAccountId: text("customer_account_id").references(() => customerAccounts.id, {
      onDelete: "cascade",
    }),

    createdById: text("created_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    isResolved: boolean("is_resolved").notNull().default(false),
    isPinned: boolean("is_pinned").notNull().default(false),

    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    messageCount: integer("message_count").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("thread_project_idx").on(t.projectId, t.lastMessageAt),
    index("thread_customer_idx").on(t.customerAccountId, t.lastMessageAt),
    index("thread_visibility_idx").on(t.visibility, t.lastMessageAt),
  ],
);

export const messages = pgTable(
  "message",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    threadId: text("thread_id")
      .notNull()
      .references(() => messageThreads.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    parentMessageId: text("parent_message_id").references((): AnyPgColumn => messages.id, {
      onDelete: "cascade",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("message_thread_idx").on(t.threadId, t.createdAt),
    index("message_author_idx").on(t.authorId),
  ],
);

export const threadParticipants = pgTable(
  "thread_participant",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    threadId: text("thread_id")
      .notNull()
      .references(() => messageThreads.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
    isMuted: boolean("is_muted").notNull().default(false),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("thread_participant_unique_idx").on(t.threadId, t.userId),
    index("thread_participant_user_idx").on(t.userId),
  ],
);

export const mentions = pgTable(
  "mention",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("mention_unique_idx").on(t.messageId, t.userId),
    index("mention_user_idx").on(t.userId),
  ],
);

// ===========================================================================
// FILES
// ===========================================================================

export const fileAssets = pgTable(
  "file_asset",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    name: text("name").notNull(),
    kind: assetKindEnum("kind").notNull().default("FILE"),
    /** External address for a LINK. Null for uploads, which stream from storageKey. */
    url: text("url"),
    /** Path on the configured storage root. Null for a LINK. */
    storageKey: text("storage_key"),
    description: text("description"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    visibility: visibilityEnum("visibility").notNull().default("INTERNAL"),
    /**
     * A recording is a LINK asset the portal's Recordings tab surfaces
     * separately from ordinary shared documents. Not attached to a task —
     * always project-level, since a training session isn't one action item.
     */
    isRecording: boolean("is_recording").notNull().default(false),

    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    customerAccountId: text("customer_account_id").references(() => customerAccounts.id, {
      onDelete: "cascade",
    }),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    messageId: text("message_id").references(() => messages.id, { onDelete: "cascade" }),
    uploadedById: text("uploaded_by_id").references(() => users.id, { onDelete: "set null" }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("file_project_visibility_idx").on(t.projectId, t.visibility),
    index("file_customer_idx").on(t.customerAccountId),
    index("file_message_idx").on(t.messageId),
    index("file_task_idx").on(t.taskId, t.visibility),
  ],
);

// ===========================================================================
// TIME, NOTIFICATIONS, AUDIT
// ===========================================================================

export const timeEntries = pgTable(
  "time_entry",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
    minutes: integer("minutes").notNull(),
    workedOn: timestamp("worked_on", { withTimezone: true }).notNull(),
    note: text("note"),
    billable: boolean("billable").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("time_entry_user_idx").on(t.userId, t.workedOn),
    index("time_entry_project_idx").on(t.projectId, t.workedOn),
  ],
);

export const notifications = pgTable(
  "notification",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    linkUrl: text("link_url"),
    readAt: timestamp("read_at", { withTimezone: true }),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notification_user_idx").on(t.userId, t.readAt),
    index("notification_created_idx").on(t.createdAt),
  ],
);

/**
 * Org-wide settings. Exactly one row, id = "singleton". Holds the notification
 * defaults new people inherit, so an admin can set policy once.
 */
export const orgSettings = pgTable("org_settings", {
  id: text("id").primaryKey().default("singleton"),
  /** Defaults applied to staff who have not set their own preferences. */
  staffDefaults: jsonb("staff_defaults").$type<NotificationPrefs>(),
  /** Defaults applied to customer contacts. */
  customerDefaults: jsonb("customer_defaults").$type<NotificationPrefs>(),
  /** Master kill switch for outbound email, useful during testing. */
  emailEnabled: boolean("email_enabled").notNull().default(true),
  /**
   * Microsoft Teams. A Power Automate "Workflows" webhook URL — the successor
   * to the Office 365 incoming-webhook connector Microsoft retired in May 2026.
   * Posts land in ONE staff channel, so cards may carry internal detail; they
   * are never sent on a customer's behalf and never sent to a customer.
   */
  teamsEnabled: boolean("teams_enabled").notNull().default(false),
  teamsWebhookUrl: text("teams_webhook_url"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    /** e.g. "task.visibility.changed" */
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    summary: text("summary"),
    metadata: jsonb("metadata"),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_entity_idx").on(t.entityType, t.entityId),
    index("audit_actor_idx").on(t.actorId, t.createdAt),
    index("audit_created_idx").on(t.createdAt),
  ],
);

// ===========================================================================
// RELATIONS
// ===========================================================================

export const customerAccountsRelations = relations(customerAccounts, ({ many }) => ({
  contacts: many(users),
  projects: many(projects),
  threads: many(messageThreads),
  files: many(fileAssets),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  customerAccount: one(customerAccounts, {
    fields: [users.customerAccountId],
    references: [customerAccounts.id],
  }),
  memberships: many(projectMembers),
  assignedTasks: many(tasks, { relationName: "TaskAssignee" }),
  messages: many(messages),
  threadParticipants: many(threadParticipants),
  notifications: many(notifications),
  timeEntries: many(timeEntries),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  customerAccount: one(customerAccounts, {
    fields: [projects.customerAccountId],
    references: [customerAccounts.id],
  }),
  lead: one(users, { fields: [projects.leadId], references: [users.id] }),
  template: one(projectTemplates, {
    fields: [projects.templateId],
    references: [projectTemplates.id],
  }),
  scope: one(projectScopes, { fields: [projects.id], references: [projectScopes.projectId] }),
  members: many(projectMembers),
  phases: many(phases),
  tasks: many(tasks),
  milestones: many(milestones),
  threads: many(messageThreads),
  risks: many(risks),
  statusUpdates: many(statusUpdates),
  files: many(fileAssets),
  timeEntries: many(timeEntries),
  slipEvents: many(slipEvents),
}));

export const projectScopesRelations = relations(projectScopes, ({ one }) => ({
  project: one(projects, { fields: [projectScopes.projectId], references: [projects.id] }),
}));

export const slipEventsRelations = relations(slipEvents, ({ one }) => ({
  project: one(projects, { fields: [slipEvents.projectId], references: [projects.id] }),
  createdBy: one(users, { fields: [slipEvents.createdById], references: [users.id] }),
}));

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, { fields: [projectMembers.projectId], references: [projects.id] }),
  user: one(users, { fields: [projectMembers.userId], references: [users.id] }),
}));

export const phasesRelations = relations(phases, ({ one, many }) => ({
  project: one(projects, { fields: [phases.projectId], references: [projects.id] }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  phase: one(phases, { fields: [tasks.phaseId], references: [phases.id] }),
  assignee: one(users, {
    fields: [tasks.assigneeId],
    references: [users.id],
    relationName: "TaskAssignee",
  }),
  parentTask: one(tasks, {
    fields: [tasks.parentTaskId],
    references: [tasks.id],
    relationName: "Subtasks",
  }),
  subtasks: many(tasks, { relationName: "Subtasks" }),
  comments: many(taskComments),
}));

export const taskCommentsRelations = relations(taskComments, ({ one }) => ({
  task: one(tasks, { fields: [taskComments.taskId], references: [tasks.id] }),
  author: one(users, { fields: [taskComments.authorId], references: [users.id] }),
}));

export const milestonesRelations = relations(milestones, ({ one }) => ({
  project: one(projects, { fields: [milestones.projectId], references: [projects.id] }),
}));

export const risksRelations = relations(risks, ({ one }) => ({
  project: one(projects, { fields: [risks.projectId], references: [projects.id] }),
  owner: one(users, { fields: [risks.ownerId], references: [users.id] }),
}));

export const statusUpdatesRelations = relations(statusUpdates, ({ one }) => ({
  project: one(projects, { fields: [statusUpdates.projectId], references: [projects.id] }),
  author: one(users, { fields: [statusUpdates.authorId], references: [users.id] }),
}));

export const messageThreadsRelations = relations(messageThreads, ({ one, many }) => ({
  project: one(projects, { fields: [messageThreads.projectId], references: [projects.id] }),
  customerAccount: one(customerAccounts, {
    fields: [messageThreads.customerAccountId],
    references: [customerAccounts.id],
  }),
  createdBy: one(users, { fields: [messageThreads.createdById], references: [users.id] }),
  messages: many(messages),
  participants: many(threadParticipants),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  thread: one(messageThreads, { fields: [messages.threadId], references: [messageThreads.id] }),
  author: one(users, { fields: [messages.authorId], references: [users.id] }),
  parentMessage: one(messages, {
    fields: [messages.parentMessageId],
    references: [messages.id],
    relationName: "Replies",
  }),
  replies: many(messages, { relationName: "Replies" }),
  mentions: many(mentions),
  attachments: many(fileAssets),
}));

export const threadParticipantsRelations = relations(threadParticipants, ({ one }) => ({
  thread: one(messageThreads, {
    fields: [threadParticipants.threadId],
    references: [messageThreads.id],
  }),
  user: one(users, { fields: [threadParticipants.userId], references: [users.id] }),
}));

export const mentionsRelations = relations(mentions, ({ one }) => ({
  message: one(messages, { fields: [mentions.messageId], references: [messages.id] }),
  user: one(users, { fields: [mentions.userId], references: [users.id] }),
}));

export const fileAssetsRelations = relations(fileAssets, ({ one }) => ({
  project: one(projects, { fields: [fileAssets.projectId], references: [projects.id] }),
  customerAccount: one(customerAccounts, {
    fields: [fileAssets.customerAccountId],
    references: [customerAccounts.id],
  }),
  task: one(tasks, { fields: [fileAssets.taskId], references: [tasks.id] }),
  message: one(messages, { fields: [fileAssets.messageId], references: [messages.id] }),
  uploadedBy: one(users, { fields: [fileAssets.uploadedById], references: [users.id] }),
}));

export const projectTemplatesRelations = relations(projectTemplates, ({ many }) => ({
  phases: many(templatePhases),
  milestones: many(templateMilestones),
  projects: many(projects),
}));

export const templatePhasesRelations = relations(templatePhases, ({ one, many }) => ({
  template: one(projectTemplates, {
    fields: [templatePhases.templateId],
    references: [projectTemplates.id],
  }),
  tasks: many(templateTasks),
}));

export const templateTasksRelations = relations(templateTasks, ({ one }) => ({
  phase: one(templatePhases, {
    fields: [templateTasks.phaseId],
    references: [templatePhases.id],
  }),
}));

export const templateMilestonesRelations = relations(templateMilestones, ({ one }) => ({
  template: one(projectTemplates, {
    fields: [templateMilestones.templateId],
    references: [projectTemplates.id],
  }),
}));

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  user: one(users, { fields: [timeEntries.userId], references: [users.id] }),
  project: one(projects, { fields: [timeEntries.projectId], references: [projects.id] }),
  task: one(tasks, { fields: [timeEntries.taskId], references: [tasks.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(users, { fields: [auditLogs.actorId], references: [users.id] }),
}));

// ===========================================================================
// INFERRED TYPES
// ===========================================================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type CustomerAccount = typeof customerAccounts.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Phase = typeof phases.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type Milestone = typeof milestones.$inferSelect;
export type Risk = typeof risks.$inferSelect;
export type ProjectScope = typeof projectScopes.$inferSelect;
export type NewProjectScope = typeof projectScopes.$inferInsert;
export type SlipEvent = typeof slipEvents.$inferSelect;
export type NewSlipEvent = typeof slipEvents.$inferInsert;
export type StatusUpdate = typeof statusUpdates.$inferSelect;
export type MessageThread = typeof messageThreads.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type FileAsset = typeof fileAssets.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type ProjectTemplate = typeof projectTemplates.$inferSelect;

export type NotificationPrefs = {
  emailEnabled: boolean;
  types: Partial<Record<NotificationType, boolean>>;
};

export type OrgSettings = typeof orgSettings.$inferSelect;
export type Role = (typeof roleEnum.enumValues)[number];
export type Visibility = (typeof visibilityEnum.enumValues)[number];
export type OwnerSide = (typeof ownerSideEnum.enumValues)[number];
export type TaskStatus = (typeof taskStatusEnum.enumValues)[number];
export type ProjectStatus = (typeof projectStatusEnum.enumValues)[number];
export type Health = (typeof healthEnum.enumValues)[number];
export type Priority = (typeof priorityEnum.enumValues)[number];
export type ProjectType = (typeof projectTypeEnum.enumValues)[number];
export type CustomerStatus = (typeof customerStatusEnum.enumValues)[number];
export type RiskSeverity = (typeof riskSeverityEnum.enumValues)[number];
export type RiskStatus = (typeof riskStatusEnum.enumValues)[number];
export type ComplexityTier = (typeof complexityTierEnum.enumValues)[number];
export type DiscoveryScenario = (typeof discoveryScenarioEnum.enumValues)[number];
export type SlipCause = (typeof slipCauseEnum.enumValues)[number];
export type PhaseStatus = (typeof phaseStatusEnum.enumValues)[number];
export type ProjectMemberRole = (typeof projectMemberRoleEnum.enumValues)[number];
export type NotificationType = (typeof notificationTypeEnum.enumValues)[number];

export { sql };
