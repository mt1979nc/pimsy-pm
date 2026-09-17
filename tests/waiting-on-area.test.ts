import { describe, expect, it } from "vitest";
import { IMPLEMENTATION_PHASES } from "@/db/template-implementation";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  classifyWaitingOnArea,
  countWaitingOnByArea,
  formatWaitingOnAreaHint,
  groupWaitingOnByArea,
  waitingOnPhaseDetail,
} from "@/lib/waiting-on-area";

describe("classifyWaitingOnArea", () => {
  it("maps Discovery / Configuration / Training playbook tabs", () => {
    expect(classifyWaitingOnArea("Discovery")).toBe("discovery");
    expect(classifyWaitingOnArea("Site Configuration")).toBe("configuration");
    expect(classifyWaitingOnArea("Configuration")).toBe("configuration");
    expect(classifyWaitingOnArea("Core (Train the Trainer)")).toBe("training");
    expect(classifyWaitingOnArea("End-User Training Prep")).toBe("training");
  });

  it("keeps Kickoff, Accessing Pimsy, import, Billing, and RCM off the highlight buckets", () => {
    expect(classifyWaitingOnArea("Kickoff")).toBe("other");
    expect(classifyWaitingOnArea("Accessing Pimsy")).toBe("other");
    expect(classifyWaitingOnArea("Demographic Import")).toBe("other");
    expect(classifyWaitingOnArea("Billing")).toBe("other");
    expect(classifyWaitingOnArea("Billing Configuration")).toBe("other");
    expect(classifyWaitingOnArea("ePrescribe")).toBe("other");
    expect(classifyWaitingOnArea("RCM Kickoff")).toBe("other");
    expect(classifyWaitingOnArea("Payer & Enrollment")).toBe("other");
    expect(classifyWaitingOnArea(null)).toBe("other");
    expect(classifyWaitingOnArea("")).toBe("other");
  });

  it("classifies every Implementation playbook phase name", () => {
    const byArea: Record<string, string[]> = {
      discovery: [],
      configuration: [],
      training: [],
      other: [],
    };
    for (const phase of IMPLEMENTATION_PHASES) {
      byArea[classifyWaitingOnArea(phase.name)].push(phase.name);
    }
    expect(byArea.discovery).toEqual(["Discovery"]);
    expect(byArea.configuration).toEqual(["Site Configuration"]);
    expect(byArea.training).toEqual(["Core (Train the Trainer)", "End-User Training Prep"]);
    expect(byArea.other).toContain("Kickoff");
    expect(byArea.other).toContain("Accessing Pimsy");
    expect(byArea.other).toContain("Billing");
    expect(byArea.other).toContain("Billing Configuration");
    expect(byArea.other).not.toContain("Discovery");
    expect(byArea.other).not.toContain("Site Configuration");
  });
});

describe("groupWaitingOnByArea", () => {
  const rows = [
    { id: "logo", title: "Upload Company Logo(s)", phase: { name: "Discovery" } },
    { id: "train1", title: "Schedule Training 1", phase: { name: "Core (Train the Trainer)" } },
    { id: "idp", title: "Prescriber ID proofing", phase: { name: "ePrescribe" } },
    { id: "org", title: "Organization Details Form", phase: { name: "Discovery" } },
    { id: "enduser", title: "Schedule end-user sessions", phase: { name: "End-User Training Prep" } },
  ];

  it("keeps the full chase list and groups highlight areas first", () => {
    const groups = groupWaitingOnByArea(rows);
    expect(groups.map((g) => g.key)).toEqual(["discovery", "training", "other"]);
    expect(groups[0]!.tasks.map((t) => t.id)).toEqual(["logo", "org"]);
    expect(groups[1]!.tasks.map((t) => t.id)).toEqual(["train1", "enduser"]);
    expect(groups[2]!.tasks.map((t) => t.id)).toEqual(["idp"]);
  });

  it("does not invent empty highlight sections", () => {
    const groups = groupWaitingOnByArea([
      { id: "logo", title: "Upload Company Logo(s)", phase: { name: "Discovery" } },
    ]);
    expect(groups.map((g) => g.key)).toEqual(["discovery"]);
  });

  it("counts highlight areas for staff chips and leadership hints", () => {
    const counts = countWaitingOnByArea(rows);
    expect(counts).toEqual({ discovery: 2, configuration: 0, training: 2, other: 1 });
    expect(formatWaitingOnAreaHint(counts)).toBe("2 Discovery · 2 Training · 1 other");
    expect(formatWaitingOnAreaHint({ discovery: 0, configuration: 0, training: 0, other: 0 })).toBeUndefined();
  });
});

describe("waitingOnPhaseDetail", () => {
  it("hides the phase name when it already matches the bucket label", () => {
    expect(waitingOnPhaseDetail("Discovery", "discovery")).toBeNull();
    expect(waitingOnPhaseDetail("Site Configuration", "configuration")).toBeNull();
    expect(waitingOnPhaseDetail("Core (Train the Trainer)", "training")).toBe("Core (Train the Trainer)");
    expect(waitingOnPhaseDetail("Kickoff", "other")).toBe("Kickoff");
    expect(waitingOnPhaseDetail("Billing Configuration", "other")).toBe("Billing Configuration");
  });
});

describe("staff chase-list surfaces", () => {
  it("groups the existing waiting-on-customer list instead of replacing it", () => {
    const files = [
      "src/app/(app)/dashboard/page.tsx",
      "src/app/(app)/my-work/page.tsx",
      "src/app/(app)/projects/[id]/page.tsx",
      "src/app/(app)/reports/page.tsx",
      "src/components/waiting-on-customer-list.tsx",
    ];
    for (const rel of files) {
      const src = readFileSync(resolve(process.cwd(), rel), "utf8");
      expect(src, rel).toMatch(/WaitingOnCustomerList/);
    }
    const helper = readFileSync(resolve(process.cwd(), "src/lib/waiting-on-area.ts"), "utf8");
    expect(helper).not.toMatch(/from ["']@\/db["']/);
    expect(helper).not.toMatch(/postgres/);
  });
});
