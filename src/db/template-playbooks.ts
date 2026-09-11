/**
 * The four site-creation playbook paths Alexander asked for.
 *
 * Built from the Dock implementation playbook plus a lite / full RCM track.
 * Optional areas and default staffing roles are applied here so the raw
 * Dock port in template-implementation.ts stays readable.
 */

import {
  IMPLEMENTATION_PHASES,
  IMPLEMENTATION_MILESTONES,
  RCM_TEMPLATE,
  type SeedPhase,
  type SeedTask,
} from "./template-implementation";

export type PlaybookSeed = {
  name: string;
  description: string;
  type: "IMPLEMENTATION" | "SUPPORT";
  durationDays: number;
  code: string;
  playbookPath: "EHR" | "EHR_RCM" | "RCM_LEGACY" | "RCM_PRISM";
  phases: SeedPhase[];
  milestones: typeof IMPLEMENTATION_MILESTONES;
};

const OVERLAP_BY_TITLE: Record<string, string> = {
  "Billing Questionnaire": "billing_questionnaire",
  "Complete & Upload Billing Spreadsheet — Accepted Payers, Modifiers": "billing_spreadsheet",
  "Review Billing Questionnaire Data Sheet": "billing_questionnaire_review",
  "Schedule Billing Workflow Discovery Meeting": "billing_workflow_discovery",
  "Payer Setup": "payer_setup",
  "ClaimMD Enrollment": "claimmd_enrollment",
  "Complete RCM intake questionnaire": "rcm_intake",
  "Provide payer list and contracts": "payer_list",
  "Payer setup and validation": "payer_setup",
  "ClaimMD enrollment": "claimmd_enrollment",
  "Billing workflow walkthrough": "billing_workflow_discovery",
};

const OPTIONAL_PHASES: Record<string, string> = {
  "Demographic Import": "data_import",
  ePrescribe: "eprescribe",
  "Inpatient / MAT": "inpatient_mat",
};

function taskArea(title: string, inherited?: string): { isOptional: boolean; areaKey?: string } {
  if (/group notes/i.test(title)) return { isOptional: true, areaKey: "group_notes" };
  if (/payroll/i.test(title)) return { isOptional: true, areaKey: "payroll" };
  if (/pdmp/i.test(title)) return { isOptional: true, areaKey: inherited ?? "eprescribe" };
  if (inherited) return { isOptional: true, areaKey: inherited };
  return { isOptional: false };
}

function defaultRoleFor(
  task: SeedTask,
  track: "EHR" | "RCM" | "SHARED",
  phaseName: string,
): SeedTask["defaultRole"] {
  if (task.ownerSide === "CUSTOMER") return undefined;
  if (task.defaultRole) return task.defaultRole;
  const title = task.title.toLowerCase();
  const phase = phaseName.toLowerCase();
  if (track === "RCM") {
    if (/kickoff|first clean|first claims/i.test(title)) return "RCM_IMPLEMENTATION_SPECIALIST";
    return "RCM_IMPLEMENTATION_SPECIALIST";
  }
  if (/tier 2|post go-live/.test(title) || /post go-live/.test(phase)) {
    if (/billing|payroll|payment/.test(title)) return "T2_BILLING_SUPPORT";
  }
  if (
    /billing|claimmd|payer|invoice|authorization|auth training/.test(title) ||
    phase === "billing"
  ) {
    return "T1_BILLING_SUPPORT";
  }
  return "IMPLEMENTATION_SPECIALIST";
}

function annotateTask(
  task: SeedTask,
  track: "EHR" | "RCM" | "SHARED",
  phaseName: string,
  inheritedArea?: string,
): SeedTask {
  const area = taskArea(task.title, inheritedArea);
  return {
    ...task,
    workTrack: task.workTrack ?? track,
    overlapKey: task.overlapKey ?? OVERLAP_BY_TITLE[task.title],
    isOptional: task.isOptional ?? area.isOptional,
    areaKey: task.areaKey ?? area.areaKey,
    defaultRole: defaultRoleFor(task, track, phaseName),
    children: task.children?.map((c) => annotateTask(c, track, phaseName, area.areaKey ?? inheritedArea)),
  };
}

function annotatePhases(phases: SeedPhase[], track: "EHR" | "RCM" | "SHARED"): SeedPhase[] {
  return phases.map((p) => {
    const areaKey = p.areaKey ?? OPTIONAL_PHASES[p.name];
    const isOptional = p.isOptional ?? Boolean(areaKey);
    return {
      ...p,
      workTrack: p.workTrack ?? track,
      isOptional,
      areaKey,
      tasks: p.tasks.map((t) => annotateTask(t, track, p.name, areaKey)),
    };
  });
}

function shiftPhases(phases: SeedPhase[], offsetDays: number): SeedPhase[] {
  return phases.map((p) => ({
    ...p,
    offsetDays: p.offsetDays + offsetDays,
    tasks: p.tasks.map((t) => ({
      ...t,
      offsetDays: (t.offsetDays ?? 0) + (offsetDays > 0 ? 0 : 0),
      children: t.children?.map((c) => ({ ...c })),
    })),
  }));
}

const RCM_PHASES: SeedPhase[] = RCM_TEMPLATE.phases.map((p) => ({
  ...p,
  workTrack: "RCM" as const,
}));

const RCM_LITE_PHASES: SeedPhase[] = [
  {
    name: "Plan overview",
    description: "A lite orientation for a practice already live on PIMSY, with no Prism history.",
    visibility: "SHARED",
    offsetDays: 0,
    durationDays: 7,
    workTrack: "RCM",
    tasks: [
      {
        title: "Confirm live PIMSY site and current billing path",
        ownerSide: "INTERNAL",
        visibility: "SHARED",
        priority: "HIGH",
        workTrack: "RCM",
      },
      {
        title: "Record practice contacts and go-forward owners",
        ownerSide: "INTERNAL",
        visibility: "INTERNAL",
        workTrack: "RCM",
      },
      {
        title: "Confirm there is no Prism historical data to carry forward",
        ownerSide: "INTERNAL",
        visibility: "INTERNAL",
        workTrack: "RCM",
      },
      {
        title: "Review RCM plan overview with the practice",
        ownerSide: "INTERNAL",
        visibility: "SHARED",
        priority: "HIGH",
        workTrack: "RCM",
      },
    ],
  },
  ...RCM_PHASES.map((p) => ({ ...p, offsetDays: p.offsetDays + 7 })),
];

const EHR_PHASES = annotatePhases(IMPLEMENTATION_PHASES, "EHR");
const RCM_FULL_PHASES = annotatePhases(RCM_PHASES, "RCM");
const RCM_LITE_ANNOTATED = annotatePhases(RCM_LITE_PHASES, "RCM");

export const EHR_PLAYBOOK: PlaybookSeed = {
  name: "PIMSY Implementation",
  description:
    "The standard PIMSY EHR go-live playbook, ported from Dock. Kickoff through post-go-live Tier 2 training, with customer action items surfaced in the portal.",
  type: "IMPLEMENTATION",
  durationDays: 90,
  code: "ehr",
  playbookPath: "EHR",
  phases: EHR_PHASES,
  milestones: IMPLEMENTATION_MILESTONES,
};

export const EHR_RCM_PLAYBOOK: PlaybookSeed = {
  name: "EHR + RCM Implementation",
  description:
    "Full EHR implementation plus the RCM onboarding track on the same site. RCM work runs alongside billing.",
  type: "IMPLEMENTATION",
  durationDays: 120,
  code: "ehr_rcm",
  playbookPath: "EHR_RCM",
  phases: [...EHR_PHASES, ...annotatePhases(shiftPhases(RCM_PHASES, 56), "RCM")],
  milestones: [
    ...IMPLEMENTATION_MILESTONES,
    { name: "RCM kickoff complete", offsetDays: 63, visibility: "SHARED" as const, isGoLive: false },
    { name: "First clean claim submitted", offsetDays: 110, visibility: "SHARED" as const, isGoLive: false },
  ],
};

export const RCM_LEGACY_PLAYBOOK: PlaybookSeed = {
  name: "RCM Legacy (No Prism data)",
  description:
    "Very lite onboarding for an existing PIMSY customer adding RCM with no Prism historical data — plan overview plus RCM items only.",
  type: "SUPPORT",
  durationDays: 52,
  code: "rcm_legacy",
  playbookPath: "RCM_LEGACY",
  phases: RCM_LITE_ANNOTATED,
  milestones: [
    { name: "Plan overview complete", offsetDays: 7, visibility: "SHARED" as const, isGoLive: false },
    { name: "RCM kickoff complete", offsetDays: 14, visibility: "SHARED" as const, isGoLive: false },
    { name: "Payer enrollment complete", offsetDays: 35, visibility: "SHARED" as const, isGoLive: false },
    { name: "First clean claim submitted", offsetDays: 47, visibility: "SHARED" as const, isGoLive: true },
  ],
};

export const RCM_PRISM_PLAYBOOK: PlaybookSeed = {
  name: "Existing EHR + RCM (Prism data)",
  description:
    "Add RCM to a site that already has Prism / implementation history. Overlapping standard-implementation tasks auto-complete; RCM metrics track separately.",
  type: "SUPPORT",
  durationDays: 45,
  code: "rcm_prism",
  playbookPath: "RCM_PRISM",
  phases: RCM_FULL_PHASES,
  milestones: [
    { name: "RCM kickoff complete", offsetDays: 7, visibility: "SHARED" as const, isGoLive: false },
    { name: "Payer enrollment complete", offsetDays: 28, visibility: "SHARED" as const, isGoLive: false },
    { name: "First clean claim submitted", offsetDays: 40, visibility: "SHARED" as const, isGoLive: true },
  ],
};

export const ALL_PLAYBOOKS: PlaybookSeed[] = [
  EHR_PLAYBOOK,
  EHR_RCM_PLAYBOOK,
  RCM_LEGACY_PLAYBOOK,
  RCM_PRISM_PLAYBOOK,
];
