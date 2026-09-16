import { describe, expect, it } from "vitest";
import {
  canBookTrainingSession,
  findNextSession,
  isAddDateToTitleTask,
  isRecordingLinkTask,
  isScheduleTrainingTask,
  isTrainingSessionParent,
  looksLikeZoomRecording,
  matchRecordingNameToSessions,
  normalizeRecordingUrl,
  parseRecordingNameRef,
  parseTrainingRef,
  shouldTreatLinkAsRecording,
  trainingKey,
} from "@/lib/training-session";
import { parseSessionDateTime } from "@/lib/dates";
import { DOCK_TRAINING_1_TITLE, PATH_TRAINING_1_TITLE } from "@/db/dock-training-checklists";

describe("parseTrainingRef", () => {
  it("classifies PATH and Dock Training 1 parents as the same core session", () => {
    const path = parseTrainingRef(PATH_TRAINING_1_TITLE);
    const dock = parseTrainingRef(DOCK_TRAINING_1_TITLE);
    expect(path).toMatchObject({ role: "session", family: "core", sessionNumber: 1, sessionLabel: "Training 1" });
    expect(dock).toMatchObject({ role: "session", family: "core", sessionNumber: 1 });
    expect(trainingKey(path!)).toBe(trainingKey(dock!));
  });

  it("classifies schedule, recording-link, and add-date housekeeping rows", () => {
    expect(parseTrainingRef("Schedule Training 1")).toMatchObject({
      role: "schedule",
      family: "core",
      sessionNumber: 1,
    });
    expect(parseTrainingRef("Training 1 Recording Link")).toMatchObject({
      role: "recording",
      family: "core",
      sessionNumber: 1,
    });
    expect(parseTrainingRef("Add Date to Training Task Title")).toMatchObject({
      role: "add_date",
      family: "core",
      sessionNumber: 1,
    });
    expect(isScheduleTrainingTask("Schedule Training 2")).toBe(true);
    expect(isRecordingLinkTask("Training 2 Recording Link")).toBe(true);
    expect(isAddDateToTitleTask("Add Date to Training Task Title")).toBe(true);
    expect(isTrainingSessionParent("Training 2: Client Charts")).toBe(true);
    expect(canBookTrainingSession("Schedule Training 1")).toBe(true);
    expect(canBookTrainingSession("Training 1: Intro to PIMSY")).toBe(true);
    expect(canBookTrainingSession("Confirm users have logged in (prior to training)")).toBe(false);
  });

  it("keeps billing / payroll families distinct from core", () => {
    expect(parseTrainingRef("Billing Training 1: Codes & Rates")).toMatchObject({
      role: "session",
      family: "billing",
      sessionNumber: 1,
      sessionLabel: "Billing Training 1",
    });
    expect(parseTrainingRef("Billing Training 1 Recording Link")).toMatchObject({
      role: "recording",
      family: "billing",
      sessionNumber: 1,
    });
    expect(parseTrainingRef("Payroll Training 1 (1 week before go-live)")).toMatchObject({
      role: "session",
      family: "payroll",
      sessionNumber: 1,
    });
  });

  it("does not treat login-confirm or unrelated tasks as sessions", () => {
    expect(parseTrainingRef("Confirm users have logged in (prior to training)")).toBeNull();
    expect(parseTrainingRef("User Setup")).toBeNull();
    expect(parseTrainingRef("Expose Parking Lot")).toBeNull();
  });
});

describe("recording name → session match", () => {
  const sessions = [
    { id: "t1", title: "Training 1: Intro to PIMSY" },
    { id: "t2", title: "Training 2: Client Charts" },
    { id: "b1", title: "Billing Training 1: Codes & Rates" },
  ];

  it("matches Core Training — Session N and Training N names", () => {
    expect(parseRecordingNameRef("Core Training — Session 2")).toEqual({ family: "core", sessionNumber: 2 });
    expect(matchRecordingNameToSessions("Core Training — Session 2", sessions)?.id).toBe("t2");
    expect(matchRecordingNameToSessions("Training 1 recording", sessions)?.id).toBe("t1");
    expect(matchRecordingNameToSessions("Billing Training 1", sessions)?.id).toBe("b1");
    expect(matchRecordingNameToSessions("Kickoff recording", sessions)).toBeNull();
  });
});

describe("next session + Zoom recording URLs", () => {
  it("finds Training N+1 in the same family", () => {
    const tasks = [
      { id: "t1", title: "Training 1: Intro to PIMSY" },
      { id: "t2", title: "Training 2: Client Charts" },
      { id: "b1", title: "Billing Training 1: Codes & Rates" },
      { id: "b2", title: "Billing Training 2: Authorizations" },
    ];
    expect(findNextSession("Training 1: Intro to PIMSY", tasks)?.id).toBe("t2");
    expect(findNextSession("Billing Training 1: Codes & Rates", tasks)?.id).toBe("b2");
    expect(findNextSession("Training 2: Client Charts", tasks)).toBeNull();
  });

  it("treats Zoom /rec/ paths as recordings, not join links", () => {
    expect(looksLikeZoomRecording(new URL("https://zoom.us/rec/share/abc"))).toBe(true);
    expect(looksLikeZoomRecording(new URL("https://us02web.zoom.us/rec/play/xyz"))).toBe(true);
    expect(looksLikeZoomRecording(new URL("https://zoom.us/j/123456"))).toBe(false);
    expect(shouldTreatLinkAsRecording("Training 1 Recording Link", new URL("https://example.com/watch"))).toBe(
      true,
    );
    expect(shouldTreatLinkAsRecording("Training 1: Intro to PIMSY", new URL("https://zoom.us/rec/share/abc"))).toBe(
      true,
    );
    expect(shouldTreatLinkAsRecording("Training 1: Intro to PIMSY", new URL("https://zoom.us/j/123"))).toBe(false);
    expect(shouldTreatLinkAsRecording("User Setup", new URL("https://zoom.us/rec/share/abc"))).toBe(false);
  });

  it("normalizes recording URLs without hashing duplicates", () => {
    expect(normalizeRecordingUrl("https://zoom.us/rec/share/abc/")).toBe("https://zoom.us/rec/share/abc");
  });
});

describe("parseSessionDateTime", () => {
  it("uses UTC noon for date-only and a local instant when a time is present", () => {
    const dateOnly = parseSessionDateTime("2026-10-08");
    expect(dateOnly?.toISOString()).toBe("2026-10-08T12:00:00.000Z");
    const withTime = parseSessionDateTime("2026-10-08", "14:30");
    expect(withTime).toBeInstanceOf(Date);
    expect(withTime?.getHours()).toBe(14);
    expect(withTime?.getMinutes()).toBe(30);
  });
});
