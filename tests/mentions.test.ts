import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  filterMentionCandidates,
  insertMentionAt,
  mentionPlainText,
  mentionToken,
  mentionTrigger,
  newMentionUserIds,
  parseMentionTokens,
  peopleToMentionCandidates,
  shortNamesFor,
  splitMentionText,
  uniqueMentionUserIds,
  type MentionCandidate,
} from "@/lib/mentions";

const morgan: MentionCandidate = {
  id: "abc123morgan",
  name: "Morgan Manager",
  email: "morgan@pimsyehr.com",
  role: "MANAGER",
  kind: "staff",
};
const sam: MentionCandidate = {
  id: "abc123sam",
  name: "Sam Specialist",
  email: "sam@pimsyehr.com",
  role: "SPECIALIST",
  kind: "staff",
};
const avery: MentionCandidate = {
  id: "abc123avery",
  name: "Avery Acme",
  email: "avery@acme.example.com",
  role: "CUSTOMER",
  kind: "customer",
};
const morganB: MentionCandidate = {
  id: "abc123morganb",
  name: "Morgan Billing",
  email: "billing@pimsyehr.com",
  role: "MEMBER",
  kind: "staff",
};

describe("mention tokens", () => {
  it("inserts and parses @[Name](user:id) tokens", () => {
    const token = mentionToken("Morgan", morgan.id);
    expect(token).toBe("@[Morgan](user:abc123morgan)");
    const body = `Please look ${token} thanks`;
    expect(parseMentionTokens(body)).toEqual([
      { label: "Morgan", userId: morgan.id, index: 12, length: token.length },
    ]);
    expect(uniqueMentionUserIds(body)).toEqual([morgan.id]);
    expect(mentionPlainText(body)).toBe("Please look @Morgan thanks");
  });

  it("splits body into text and mention parts for chips", () => {
    const token = mentionToken("Avery", avery.id);
    expect(splitMentionText(`Hi ${token}`)).toEqual([
      { type: "text", text: "Hi " },
      { type: "mention", label: "Avery", userId: avery.id },
    ]);
  });

  it("uses first names, and First L when two people share a first name", () => {
    const names = shortNamesFor([morgan, sam, morganB, avery]);
    expect(names.get(sam.id)).toBe("Sam");
    expect(names.get(avery.id)).toBe("Avery");
    expect(names.get(morgan.id)).toBe("Morgan M");
    expect(names.get(morganB.id)).toBe("Morgan B");
  });

  it("opens the picker after @ and inserts a token at the trigger", () => {
    expect(mentionTrigger("Hello @Mo", 9)).toEqual({ start: 6, query: "Mo" });
    expect(mentionTrigger("user@email.com", 14)).toBeNull();
    expect(mentionTrigger("@[Morgan](user:abc123morgan) more", 5)).toBeNull();

    const { next, cursor } = insertMentionAt("Hello @Mo", 6, 9, mentionToken("Morgan", morgan.id));
    expect(next).toBe("Hello @[Morgan](user:abc123morgan) ");
    expect(next.slice(0, cursor)).toBe("Hello @[Morgan](user:abc123morgan) ");
  });

  it("hides customer contacts on INTERNAL and filters by query", () => {
    const all = [morgan, sam, avery];
    expect(filterMentionCandidates(all, "", "INTERNAL").map((c) => c.id)).toEqual([morgan.id, sam.id]);
    expect(filterMentionCandidates(all, "ave", "SHARED").map((c) => c.id)).toEqual([avery.id]);
  });

  it("diffs newly added mention ids for edit notify", () => {
    const before = `Note ${mentionToken("Sam", sam.id)}`;
    const after = `${before} ${mentionToken("Morgan", morgan.id)}`;
    expect(newMentionUserIds(before, after)).toEqual([morgan.id]);
  });

  it("maps people to staff vs customer candidates without duplicates", () => {
    const people = peopleToMentionCandidates([
      { id: sam.id, name: sam.name, email: sam.email, role: "SPECIALIST" },
      { id: sam.id, name: sam.name, email: sam.email, role: "SPECIALIST" },
      { id: avery.id, name: avery.name, email: avery.email, role: "CUSTOMER" },
    ]);
    expect(people).toHaveLength(2);
    expect(people.find((c) => c.id === avery.id)?.kind).toBe("customer");
    expect(people.find((c) => c.id === sam.id)?.kind).toBe("staff");
  });
});

describe("mention UI is short and on comments/updates", () => {
  it("staff comments and updates use the picker and chips", () => {
    const comments = readFileSync(resolve(process.cwd(), "src/components/task-comments.tsx"), "utf8");
    expect(comments).toMatch(/MentionTextarea/);
    expect(comments).toMatch(/MentionBody/);
    expect(comments).toMatch(/mentionCandidates/);
    expect(comments).toMatch(/Type @ to mention/);
    expect(comments).toMatch(/editTaskComment/);
    expect(comments).toMatch(/deleteTaskComment/);

    const forms = readFileSync(
      resolve(process.cwd(), "src/app/(app)/projects/[id]/overview-forms.tsx"),
      "utf8",
    );
    expect(forms).toMatch(/MentionTextarea/);
    expect(forms).toMatch(/MentionBody/);
    expect(forms).toMatch(/Type @ to mention/);
    expect(forms).not.toMatch(/revision|changelog/i);

    const picker = readFileSync(resolve(process.cwd(), "src/components/mention-textarea.tsx"), "utf8");
    expect(picker).toMatch(/shortNamesFor/);
    expect(picker).toMatch(/Team/);
    expect(picker).toMatch(/Contacts/);
  });

  it("portal shared comments get a picker; display surfaces render chips", () => {
    const portalTask = readFileSync(
      resolve(process.cwd(), "src/app/portal/projects/[id]/tasks/[taskId]/page.tsx"),
      "utf8",
    );
    expect(portalTask).toMatch(/listMentionCandidates\(id, "portal"\)/);
    expect(portalTask).toMatch(/mentionCandidates=\{mentionCandidates\}/);

    const portalProject = readFileSync(
      resolve(process.cwd(), "src/app/portal/projects/[id]/page.tsx"),
      "utf8",
    );
    expect(portalProject).toMatch(/MentionBody/);

    const customerView = readFileSync(
      resolve(process.cwd(), "src/app/(app)/projects/[id]/customer-view/page.tsx"),
      "utf8",
    );
    expect(customerView).toMatch(/MentionBody/);
  });

  it("does not add recordings or RCM work in this slice", () => {
    const comments = readFileSync(resolve(process.cwd(), "src/components/task-comments.tsx"), "utf8");
    const mentions = readFileSync(resolve(process.cwd(), "src/lib/mentions.ts"), "utf8");
    expect(comments + mentions).not.toMatch(/recording|RCM/i);
  });
});
