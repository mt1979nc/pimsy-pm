/**
 * Today's hardcoded PATH settings, as data.
 *
 * Calculations fall back to this object when the database config is missing
 * or a section has no rows. The phase 1 migration seeds the same values.
 * Tags and custom fields are empty because none are hardcoded today.
 */

export type LoadModel = "even" | "phase";

export type ConfigPhase = {
  key: string;
  label: string;
  sortOrder: number;
  hoursWeight: number;
};

export type ConfigStatus = {
  key: string;
  label: string;
  sortOrder: number;
  countsTowardLoad: boolean;
  /** Flat hrs/wk while this status is set. Null keeps the load model. */
  holdHrsPerWeek: number | null;
};

export type ConfigSlipCause = { key: string; label: string; sortOrder: number };

export type ConfigSlipApproval = {
  /** DIRECTOR means user.is_director. Any other value is matched to user.role. */
  approverRole: string;
  /** 0 means every go-live change. A slip shorter than this does not need the approver. */
  thresholdDays: number;
};

export type ConfigRole = {
  key: string;
  label: string;
  kind: "app" | "staffing" | "project";
  sortOrder: number;
  permissions: string[];
};

export type ConfigPerson = {
  userId: string;
  canLead: boolean;
  capacityExempt: boolean;
  isDirector: boolean;
  capacityHidden: boolean;
  hoursPerWeek: number;
};

export type EstimatorWeights = {
  orgSetupHours: number;
  billingConfigHours: number;
  otherSettingsHours: number;
  minutesPerUser: number;
  minutesPerLocation: number;
  minutesPerFormPage: number;
  coreTrainingSessions: number;
  stateComplianceHours: number;
  minimalOrgHours: number;
  intakeAssistantHours: number;
  configDays: number;
  maxConfigHoursPerDay: number;
  schedulingBufferDays: number;
  trainingSessionHours: number;
  trainingPrepHours: number;
  trainingHoursPerSession: number;
  payrollTrainingHours: number;
  discoveryDays: { OPTIMISTIC: number; TYPICAL: number; PESSIMISTIC: number };
  complexClinical: string[];
  serviceLineHours: Record<string, number>;
  serviceLineLabels: Record<string, string>;
  skipUsFederalHolidays: boolean;
};

export type ConfigServiceLine = {
  key: string;
  label: string;
  hours: number;
  sortOrder: number;
  complexClinical: boolean;
};

export type ConfigHiring = {
  leadWeeks: number;
  utilizationPercent: number;
  nearPercent: number;
  typicalHoursPerWeek: number;
};

export type ConfigHolidayDate = { date: string; name: string };

export type ConfigCustomField = {
  id: string;
  entity: string;
  key: string;
  label: string;
  fieldType: string;
};

export type ConfigTemplate = {
  key: string;
  name: string;
  active: boolean;
  sortOrder: number;
};

export type ConfigDockEntry = {
  acronym: string;
  included: boolean;
  note: string;
};

export type PathConfig = {
  loadModel: LoadModel;
  phases: ConfigPhase[];
  statuses: ConfigStatus[];
  slipCauses: ConfigSlipCause[];
  slipApproval: ConfigSlipApproval;
  roles: ConfigRole[];
  people: ConfigPerson[];
  estimator: EstimatorWeights;
  estimatorVersion: number;
  serviceLines: ConfigServiceLine[];
  analyticsExclusions: string[];
  hiring: ConfigHiring;
  skipUsFederalHolidays: boolean;
  holidayDates: ConfigHolidayDate[];
  tags: string[];
  customFields: ConfigCustomField[];
  templates: ConfigTemplate[];
  dockAllowlist: ConfigDockEntry[];
};

const SERVICE_LINES: ConfigServiceLine[] = [
  ["OUTPATIENT_THERAPY", "Outpatient Therapy", 0, false],
  ["MEDICATION_MANAGEMENT", "Medication Management", 1.5, true],
  ["MAT", "MAT", 1, true],
  ["IOP", "IOP", 1, false],
  ["PHP", "PHP", 1, false],
  ["GROUP_THERAPY", "Group Therapy", 1, false],
  ["INPATIENT_RESIDENTIAL", "Inpatient / Residential", 5, false],
  ["PSYCH_TESTING", "Psych Testing", 2, true],
  ["PSR_PSYCHOSOCIAL_REHAB", "PSR / Psychosocial Rehab", 0.5, false],
  ["PRP_PSYCHIATRIC_REHAB", "PRP / Psychiatric Rehab", 0.5, false],
  ["MESSAGING", "Messaging", 0.5, false],
  ["EFAX", "eFax", 0.5, false],
  ["LABS", "Labs", 2, false],
  ["EVV", "EVV", 2, false],
  ["PAYROLL", "Payroll", 2, false],
  ["EATING_DISORDER", "Eating Disorder", 2, false],
  ["COURT_ORDERED_SERVICES", "Court Ordered Services", 1, false],
  ["OTHER_SERVICES", "Other Services", 0.5, false],
].map(([key, label, hours, complexClinical], sortOrder) => ({
  key: key as string,
  label: label as string,
  hours: hours as number,
  sortOrder,
  complexClinical: complexClinical as boolean,
}));

function lineHours(): Record<string, number> {
  return Object.fromEntries(SERVICE_LINES.map((line) => [line.key, line.hours]));
}

function lineLabels(): Record<string, string> {
  return Object.fromEntries(SERVICE_LINES.map((line) => [line.key, line.label]));
}

export const DEFAULT_ESTIMATOR: EstimatorWeights = {
  orgSetupHours: 2,
  billingConfigHours: 3,
  otherSettingsHours: 2,
  minutesPerUser: 15,
  minutesPerLocation: 30,
  minutesPerFormPage: 25,
  coreTrainingSessions: 7,
  stateComplianceHours: 2,
  minimalOrgHours: 10,
  intakeAssistantHours: 2,
  configDays: 14,
  maxConfigHoursPerDay: 4,
  schedulingBufferDays: 2,
  trainingSessionHours: 1,
  trainingPrepHours: 0.5,
  trainingHoursPerSession: 1.5,
  payrollTrainingHours: 1,
  discoveryDays: { OPTIMISTIC: 10, TYPICAL: 14, PESSIMISTIC: 21 },
  complexClinical: ["MEDICATION_MANAGEMENT", "MAT", "PSYCH_TESTING"],
  serviceLineHours: lineHours(),
  serviceLineLabels: lineLabels(),
  skipUsFederalHolidays: true,
};

const APP_ROLES: ConfigRole[] = [
  ["OWNER", "Owner", ["admin", "portfolio", "templates", "users", "read_all", "create_projects"]],
  ["ADMIN", "Admin", ["admin", "portfolio", "templates", "users", "read_all", "create_projects"]],
  ["MANAGER", "Manager", ["portfolio", "read_all", "create_projects"]],
  ["SPECIALIST", "Specialist", ["read_all"]],
  ["MEMBER", "Member", []],
  ["CUSTOMER", "Customer", ["portal"]],
].map(([key, label, permissions], sortOrder) => ({
  key: key as string,
  label: label as string,
  kind: "app" as const,
  sortOrder,
  permissions: permissions as string[],
}));

const STAFFING_ROLES: ConfigRole[] = [
  ["IMPLEMENTATION_SPECIALIST", "Implementation Specialist"],
  ["T1_BILLING_SUPPORT", "T1 Billing Support"],
  ["T2_BILLING_SUPPORT", "T2 Billing Support"],
  ["RCM_IMPLEMENTATION_SPECIALIST", "RCM Implementation Specialist"],
  ["RCM_MANAGER", "RCM Manager"],
  ["IMPLEMENTATION_DIRECTOR", "Implementation Director"],
  ["SUPPORT_DIRECTOR", "Support Director"],
].map(([key, label], sortOrder) => ({
  key,
  label,
  kind: "staffing" as const,
  sortOrder,
  permissions: [] as string[],
}));

const PROJECT_ROLES: ConfigRole[] = [
  ["LEAD", "Lead"],
  ["CONTRIBUTOR", "Contributor"],
  ["OBSERVER", "Observer"],
  ["CUSTOMER_CONTACT", "Customer contact"],
  ["CUSTOMER_PROJECT_LEAD", "Customer project lead"],
  ["CUSTOMER_BILLING", "Customer billing"],
].map(([key, label], sortOrder) => ({
  key,
  label,
  kind: "project" as const,
  sortOrder,
  permissions: [] as string[],
}));

/** Dock Implementation WIP acronyms shipped in content/dock-wip-allowlist.json (2026-09-14). */
export const DEFAULT_DOCK_ACRONYMS = [
  "TANC",
  "RAC",
  "OCE",
  "FBH",
  "BHC",
  "MMHSS",
  "EBHKY",
  "LECHRIS",
  "BDMH",
  "DYM",
  "PWMI",
  "THS",
  "CEDAR",
  "CCCCARE",
  "SWMCCC",
  "RBH",
  "SENSORI",
  "MHC",
  "FFCS",
  "RENWICK",
  "CAPSTONE",
  "LIFECONN",
  "EHW",
  "GHW",
  "ROH",
  "APS",
  "PHR",
  "RPI",
  "ABQW",
  "SMSS",
  "NEOES",
  "MPA",
  "GTS",
  "UES",
  "DPS",
] as const;

export const DEFAULT_PATH_CONFIG: PathConfig = {
  loadModel: "even",
  phases: [
    ["kickoff", "Kickoff"],
    ["discovery", "Discovery"],
    ["config", "Config"],
    ["training", "Training"],
    ["pregolive", "Pre Go-Live"],
    ["complete", "Complete"],
  ].map(([key, label], sortOrder) => ({
    key,
    label,
    sortOrder,
    hoursWeight: 1,
  })),
  statuses: [
    { key: "active", label: "Active", sortOrder: 0, countsTowardLoad: true, holdHrsPerWeek: null },
    { key: "stalled", label: "Stalled", sortOrder: 1, countsTowardLoad: true, holdHrsPerWeek: null },
    { key: "special", label: "Special", sortOrder: 2, countsTowardLoad: true, holdHrsPerWeek: null },
    { key: "pre-kickoff", label: "Pre-kickoff", sortOrder: 3, countsTowardLoad: true, holdHrsPerWeek: null },
    { key: "pipeline", label: "Pipeline", sortOrder: 4, countsTowardLoad: false, holdHrsPerWeek: null },
    { key: "pre-go-live", label: "Pre Go-Live", sortOrder: 5, countsTowardLoad: true, holdHrsPerWeek: 2 },
  ],
  slipCauses: [
    { key: "CUSTOMER", label: "Customer", sortOrder: 0 },
    { key: "PIMSY", label: "PIMSY", sortOrder: 1 },
  ],
  slipApproval: { approverRole: "DIRECTOR", thresholdDays: 0 },
  roles: [...APP_ROLES, ...STAFFING_ROLES, ...PROJECT_ROLES],
  people: [],
  estimator: DEFAULT_ESTIMATOR,
  estimatorVersion: 1,
  serviceLines: SERVICE_LINES,
  analyticsExclusions: ["SENSORI", "MHC", "LECHRIS"],
  hiring: { leadWeeks: 8, utilizationPercent: 100, nearPercent: 85, typicalHoursPerWeek: 30 },
  skipUsFederalHolidays: true,
  holidayDates: [],
  tags: [],
  customFields: [],
  templates: [
    { key: "EHR", name: "EHR Implementation only", active: true, sortOrder: 0 },
    { key: "EHR_RCM", name: "EHR + RCM", active: true, sortOrder: 1 },
    { key: "RCM_LEGACY", name: "Existing EHR + RCM Legacy (No Prism data)", active: true, sortOrder: 2 },
    { key: "RCM_PRISM", name: "Existing EHR + RCM (Yes Prism data)", active: true, sortOrder: 3 },
  ],
  dockAllowlist: DEFAULT_DOCK_ACRONYMS.map((acronym) => ({
    acronym,
    included: true,
    note:
      acronym === "RAC"
        ? "Keep both RAC and TANC until Alexander consolidates."
        : "",
  })),
};

export function defaultPathConfig(): PathConfig {
  return DEFAULT_PATH_CONFIG;
}
