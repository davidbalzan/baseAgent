import { describe, expect, it } from "vitest";
import { z } from "zod";
import { reflectAfterToolCall, reflectBeforeToolCall, shouldNudgeForWeakCompletion } from "../reflection.js";

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

  it("nudges weak completion when all tool calls failed", () => {
    const check = shouldNudgeForWeakCompletion({
      totalToolCalls: 3,
      totalToolErrors: 3,
      totalToolSuccesses: 0,
      output: "Done, everything is complete.",
    });

    expect(check.shouldNudge).toBe(true);
    expect(check.reason).toBe("unverified_completion_after_failures");
  });

  it("does not nudge completion if failures are acknowledged", () => {
    const check = shouldNudgeForWeakCompletion({
      totalToolCalls: 2,
      totalToolErrors: 2,
      totalToolSuccesses: 0,
      output: "I could not complete this because both tool calls failed.",
    });

    expect(check.shouldNudge).toBe(false);
  });

  it("nudges when cancellation is claimed without successful cancel evidence", () => {
    const check = shouldNudgeForWeakCompletion({
      totalToolCalls: 4,
      totalToolErrors: 2,
      totalToolSuccesses: 2,
      output: "All tasks cancelled successfully.",
      toolStats: {
        list_scheduled_tasks: { success: 1, error: 0 },
        cancel_scheduled_task: { success: 0, error: 3 },
      },
    });

    expect(check.shouldNudge).toBe(true);
    expect(check.reason).toBe("missing_evidence_for_scheduler_claim");
  });

  it("does not nudge cancellation claim when cancel evidence exists", () => {
    const check = shouldNudgeForWeakCompletion({
      totalToolCalls: 3,
      totalToolErrors: 0,
      totalToolSuccesses: 3,
      output: "Tasks cancelled.",
      toolStats: {
        cancel_scheduled_task: { success: 2, error: 0 },
      },
    });

    expect(check.shouldNudge).toBe(false);
  });

  it("nudges memory claim without memory tool success", () => {
    const check = shouldNudgeForWeakCompletion({
      totalToolCalls: 2,
      totalToolErrors: 1,
      totalToolSuccesses: 1,
      output: "Saved to memory successfully.",
      toolStats: {
        memory_write: { success: 0, error: 1 },
      },
    });

    expect(check.shouldNudge).toBe(true);
    expect(check.reason).toBe("missing_evidence_for_memory_claim");
  });

  it("nudges plugin install claim without install success", () => {
    const check = shouldNudgeForWeakCompletion({
      totalToolCalls: 1,
      totalToolErrors: 1,
      totalToolSuccesses: 0,
      output: "Plugin installed.",
      toolStats: {
        install_plugin: { success: 0, error: 1 },
      },
    });

    expect(check.shouldNudge).toBe(true);
    expect(check.reason).toBe("missing_evidence_for_plugin_install_claim");
  });

  it("nudges file update claim without successful file writes", () => {
    const check = shouldNudgeForWeakCompletion({
      totalToolCalls: 2,
      totalToolErrors: 2,
      totalToolSuccesses: 0,
      output: "Updated file as requested.",
      toolStats: {
        file_edit: { success: 0, error: 1 },
        file_write: { success: 0, error: 1 },
      },
    });

    expect(check.shouldNudge).toBe(true);
    expect(check.reason).toBe("missing_evidence_for_file_change_claim");
  });
});
