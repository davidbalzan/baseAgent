import { describe, expect, it } from "vitest";
import { z } from "zod";
import { reflectAfterToolCall, reflectBeforeToolCall } from "../reflection.js";

const toolDef = {
  name: "dummy",
  description: "dummy",
  parameters: z.object({}),
  execute: async () => "ok",
} as const;

describe("reflection checks", () => {
  it("blocks direct HEARTBEAT file edits", () => {
    const check = reflectBeforeToolCall(
      "file_edit",
      { path: "HEARTBEAT.md", old_string: "a", new_string: "b" },
      toolDef as any,
    );

    expect(check.shouldBlock).toBe(true);
    expect(check.risk).toBe("high");
    expect(check.recommendation).toContain("heartbeat_register");
  });

  it("flags suspicious schedule cancel id format", () => {
    const check = reflectBeforeToolCall(
      "cancel_scheduled_task",
      { taskId: "remind-me-to-drink-water" },
      toolDef as any,
    );

    expect(check.shouldBlock).toBe(false);
    expect(check.risk).toBe("medium");
    expect(check.summary).toContain("does not look like a task id prefix");
  });

  it("nudges on cancel-task not found errors", () => {
    const post = reflectAfterToolCall(
      "cancel_scheduled_task",
      { taskId: "bad-id" },
      "",
      "No task found with ID starting with \"bad-id\".",
    );

    expect(post.outcome).toBe("error");
    expect(post.shouldNudge).toBe(true);
    expect(post.recommendation).toContain("list_scheduled_tasks");
  });

  it("reports ok outcome on successful tool calls", () => {
    const post = reflectAfterToolCall("list_scheduled_tasks", {}, "Tasks listed", undefined);

    expect(post.outcome).toBe("ok");
    expect(post.shouldNudge).toBe(false);
  });
});
