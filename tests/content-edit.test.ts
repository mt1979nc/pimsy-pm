import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { canEditAuthoredRecord } from "@/lib/authored-content";

const owner = { id: "o1", role: "OWNER" };
const admin = { id: "a1", role: "ADMIN" };
const manager = { id: "m1", role: "MANAGER" };
const specialist = { id: "s1", role: "SPECIALIST" };
const otherSpecialist = { id: "s2", role: "SPECIALIST" };
const member = { id: "mb1", role: "MEMBER" };
const customer = { id: "c1", role: "CUSTOMER" };

describe("canEditAuthoredRecord", () => {
  it("lets the author edit their own comment/update/risk", () => {
    expect(canEditAuthoredRecord(specialist, specialist.id)).toBe(true);
    expect(canEditAuthoredRecord(member, member.id)).toBe(true);
    expect(canEditAuthoredRecord(customer, customer.id)).toBe(true);
    expect(canEditAuthoredRecord(manager, manager.id)).toBe(true);
  });

  it("lets OWNER and ADMIN edit anyone’s", () => {
    expect(canEditAuthoredRecord(owner, specialist.id)).toBe(true);
    expect(canEditAuthoredRecord(admin, customer.id)).toBe(true);
  });

  it("blocks covering specialists, managers, and members from editing others", () => {
    expect(canEditAuthoredRecord(otherSpecialist, specialist.id)).toBe(false);
    expect(canEditAuthoredRecord(manager, specialist.id)).toBe(false);
    expect(canEditAuthoredRecord(member, specialist.id)).toBe(false);
    expect(canEditAuthoredRecord(customer, specialist.id)).toBe(false);
  });

  it("treats a missing author as admin/owner only", () => {
    expect(canEditAuthoredRecord(owner, null)).toBe(true);
    expect(canEditAuthoredRecord(specialist, null)).toBe(false);
    expect(canEditAuthoredRecord(specialist, undefined)).toBe(false);
  });
});

describe("edit/delete UI is short and on the right surfaces", () => {
  it("comments, updates, and risks expose Edit/Delete without mentions or revision logs", () => {
    const comments = readFileSync(resolve(process.cwd(), "src/components/task-comments.tsx"), "utf8");
    expect(comments).toMatch(/editTaskComment/);
    expect(comments).toMatch(/deleteTaskComment/);
    expect(comments).toMatch(/editedAt/);
    expect(comments).toMatch(/Delete this comment\?/);
    expect(comments).not.toMatch(/@mention|mention/);

    const forms = readFileSync(
      resolve(process.cwd(), "src/app/(app)/projects/[id]/overview-forms.tsx"),
      "utf8",
    );
    expect(forms).toMatch(/editStatusUpdate/);
    expect(forms).toMatch(/deleteStatusUpdate/);
    expect(forms).toMatch(/name="health"/);
    expect(forms).toMatch(/editRisk/);
    expect(forms).toMatch(/deleteRisk/);
    expect(forms).toMatch(/Delete this update\?/);
    expect(forms).toMatch(/Delete this risk\?/);
    expect(forms).not.toMatch(/revision|changelog|@mention/i);

    const staffTask = readFileSync(
      resolve(process.cwd(), "src/app/(app)/projects/[id]/tasks/[taskId]/page.tsx"),
      "utf8",
    );
    expect(staffTask).toMatch(/currentUserRole=\{actor\.role\}/);

    const portalTask = readFileSync(
      resolve(process.cwd(), "src/app/portal/projects/[id]/tasks/[taskId]/page.tsx"),
      "utf8",
    );
    expect(portalTask).toMatch(/currentUserRole=\{actor\.role\}/);

    const customerView = readFileSync(
      resolve(process.cwd(), "src/app/(app)/projects/[id]/customer-view/tasks/[taskId]/page.tsx"),
      "utf8",
    );
    expect(customerView).toMatch(/readOnly/);
  });
});
