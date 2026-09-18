import { describe, expect, it } from "vitest";
import { operationalDescriptionForTitle } from "@/db/dock-task-descriptions";
import { aggregateRecordings, type RecordingAssetInput, type RecordingTaskInput } from "@/lib/recordings";

const t1: RecordingTaskInput = {
  id: "t1",
  title: "Training 1: Intro to PIMSY",
  parentTaskId: null,
  sessionAt: new Date("2026-10-08T14:30:00Z"),
  visibility: "SHARED",
};
const recLink: RecordingTaskInput = {
  id: "rec1",
  title: "Training 1 Recording Link",
  parentTaskId: "t1",
  sessionAt: null,
  visibility: "SHARED",
};
const t2: RecordingTaskInput = {
  id: "t2",
  title: "Training 2: Client Charts",
  parentTaskId: null,
  sessionAt: new Date("2026-10-15T14:30:00Z"),
  visibility: "SHARED",
};
const tasks = [t1, recLink, t2];

function asset(partial: Partial<RecordingAssetInput> & Pick<RecordingAssetInput, "id" | "name" | "url">): RecordingAssetInput {
  return {
    kind: "LINK",
    visibility: "SHARED",
    isRecording: false,
    taskId: null,
    createdAt: new Date("2026-10-08T18:00:00Z"),
    ...partial,
  };
}

describe("aggregateRecordings", () => {
  it("lists a mirrored recording on Training 1 with session label and date", () => {
    const rows = aggregateRecordings(
      [
        asset({
          id: "a1",
          name: "Core Training — Session 1",
          url: "https://zoom.us/rec/share/t1",
          isRecording: true,
          taskId: "t1",
        }),
      ],
      tasks,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      title: "Core Training — Session 1",
      sessionLabel: "Training 1",
      taskId: "t1",
      url: "https://zoom.us/rec/share/t1",
    });
    expect(rows[0]!.sessionAt?.toISOString()).toBe("2026-10-08T14:30:00.000Z");
  });

  it("aggregates a link on the Recording Link child even when isRecording is false", () => {
    const rows = aggregateRecordings(
      [
        asset({
          id: "a2",
          name: "Session 1",
          url: "https://example.com/watch/t1",
          taskId: "rec1",
        }),
      ],
      tasks,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sessionLabel).toBe("Training 1");
    expect(rows[0]?.taskId).toBe("t1");
  });

  it("treats a Zoom /rec/ link on the session parent as a recording", () => {
    const rows = aggregateRecordings(
      [
        asset({
          id: "a3",
          name: "Training 2 recording",
          url: "https://us02web.zoom.us/rec/play/abc",
          taskId: "t2",
        }),
      ],
      tasks,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sessionLabel).toBe("Training 2");
  });

  it("does not treat a Zoom join link on the session as a recording", () => {
    const rows = aggregateRecordings(
      [
        asset({
          id: "join",
          name: "Join Training 1",
          url: "https://zoom.us/j/123456",
          taskId: "t1",
        }),
      ],
      tasks,
    );
    expect(rows).toHaveLength(0);
  });

  it("dedupes the same URL from the child task and the mirrored row", () => {
    const url = "https://zoom.us/rec/share/abc/";
    const rows = aggregateRecordings(
      [
        asset({
          id: "flagged",
          name: "Core Training — Session 1",
          url,
          isRecording: true,
          taskId: "t1",
        }),
        asset({
          id: "child",
          name: "copy",
          url: "https://zoom.us/rec/share/abc",
          taskId: "rec1",
        }),
      ],
      tasks,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("flagged");
    expect(rows[0]?.sessionLabel).toBe("Training 1");
  });

  it("hides internal recordings from the customer list", () => {
    const assets = [
      asset({
        id: "shared",
        name: "Shared rec",
        url: "https://zoom.us/rec/share/shared",
        isRecording: true,
        taskId: "t1",
        visibility: "SHARED",
      }),
      asset({
        id: "internal",
        name: "Team rec",
        url: "https://zoom.us/rec/share/team",
        isRecording: true,
        taskId: "t2",
        visibility: "INTERNAL",
      }),
    ];
    const staff = aggregateRecordings(assets, tasks);
    const customer = aggregateRecordings(assets, tasks, { sharedOnly: true });
    expect(staff.map((r) => r.id).sort()).toEqual(["internal", "shared"]);
    expect(customer.map((r) => r.id)).toEqual(["shared"]);
  });

  it("hides a shared file on an internal training task from the customer list", () => {
    const internalSession: RecordingTaskInput = {
      ...t1,
      id: "hidden",
      visibility: "INTERNAL",
    };
    const rows = aggregateRecordings(
      [
        asset({
          id: "leak",
          name: "Hidden rec",
          url: "https://zoom.us/rec/share/hidden",
          isRecording: true,
          taskId: "hidden",
          visibility: "SHARED",
        }),
      ],
      [internalSession],
      { sharedOnly: true },
    );
    expect(rows).toHaveLength(0);
  });

  it("keeps a project-level recording with no training task", () => {
    const rows = aggregateRecordings(
      [
        asset({
          id: "orphan",
          name: "Kickoff recording",
          url: "https://zoom.us/rec/share/kickoff",
          isRecording: true,
          createdAt: new Date("2026-09-01T12:00:00Z"),
        }),
      ],
      tasks,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sessionLabel).toBeNull();
    expect(rows[0]?.title).toBe("Kickoff recording");
  });

  it("sorts by session date, newest first", () => {
    const rows = aggregateRecordings(
      [
        asset({
          id: "first",
          name: "T1",
          url: "https://zoom.us/rec/share/1",
          isRecording: true,
          taskId: "t1",
        }),
        asset({
          id: "second",
          name: "T2",
          url: "https://zoom.us/rec/share/2",
          isRecording: true,
          taskId: "t2",
        }),
      ],
      tasks,
    );
    expect(rows.map((r) => r.id)).toEqual(["second", "first"]);
  });

  it("does not invent a second upload row — only attached links", () => {
    expect(aggregateRecordings([], tasks)).toEqual([]);
  });

  it("points recording-link tasks at the training task, not Settings upload", () => {
    const copy = operationalDescriptionForTitle("Training 1 Recording Link");
    expect(copy).toMatch(/this task/i);
    expect(copy).toMatch(/Recordings tab/i);
    expect(copy).not.toMatch(/Settings/);
  });
});
