import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TaskStore } from "../task-store.js";
import { createScheduleTaskTool } from "../tools/schedule-task.tool.js";
import { createListTasksTool } from "../tools/list-tasks.tool.js";
import { createCancelTaskTool } from "../tools/cancel-task.tool.js";

describe("Scheduler tools", () => {
  let dir: string;
  let store: TaskStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "scheduler-tools-test-"));
    store = new TaskStore(join(dir, "tasks.json"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe("schedule_task", () => {
    it("creates a task with valid future date", async () => {
      const tool = createScheduleTaskTool(store);
      const futureDate = new Date(Date.now() + 300_000).toISOString();
      const result = await tool.execute({
        task: "Check email",
        executeAt: futureDate,
      });
      expect(result).toContain("Task scheduled");
      expect(store.getAll()).toHaveLength(1);
      expect(store.getAll()[0].task).toBe("Check email");
      expect(store.getAll()[0].status).toBe("pending");
    });

    it("rejects invalid date", async () => {
      const tool = createScheduleTaskTool(store);
      const result = await tool.execute({
        task: "Something",
        executeAt: "not-a-date",
      });
      expect(result).toContain("Error: Invalid date format");
      expect(store.getAll()).toHaveLength(0);
    });

    it("rejects past date", async () => {
      const tool = createScheduleTaskTool(store);
      const past = new Date(Date.now() - 60_000).toISOString();
      const result = await tool.execute({
        task: "Something",
        executeAt: past,
      });
      expect(result).toContain("Error: executeAt must be in the future");
      expect(store.getAll()).toHaveLength(0);
    });

    it("saves channelId when provided via constructor", async () => {
      const tool = createScheduleTaskTool(store, "telegram:12345");
      const futureDate = new Date(Date.now() + 300_000).toISOString();
      await tool.execute({
        task: "Notify me",
        executeAt: futureDate,
      });
      expect(store.getAll()[0].channelId).toBe("telegram:12345");
    });
  });

  describe("list_scheduled_tasks", () => {
    it("returns empty message when no tasks", async () => {
      const tool = createListTasksTool(store);
      const result = await tool.execute({});
      expect(result).toBe("No scheduled tasks.");
    });

    it("lists tasks with status and info", async () => {
      store.add({
        id: "abc12345-6789",
        task: "Check weather",
        executeAt: new Date(Date.now() + 300_000).toISOString(),
        createdAt: new Date().toISOString(),
        status: "pending",
      });
      const tool = createListTasksTool(store);
      const result = await tool.execute({});
      expect(result).toContain("[pending]");
      expect(result).toContain("Check weather");
      expect(result).toContain("abc12345");
    });
  });

  describe("cancel_scheduled_task", () => {
    it("cancels a pending task by full id", async () => {
      store.add({
        id: "cancel-me-uuid",
        task: "Something",
        executeAt: new Date(Date.now() + 60_000).toISOString(),
        createdAt: new Date().toISOString(),
        status: "pending",
      });
      const tool = createCancelTaskTool(store);
      const result = await tool.execute({ taskId: "cancel-me-uuid" });
      expect(result).toContain("Task cancelled");
      expect(store.getAll()).toHaveLength(0);
    });

    it("cancels by prefix match", async () => {
      store.add({
        id: "abcdef12-3456-7890",
        task: "Something",
        executeAt: new Date(Date.now() + 60_000).toISOString(),
        createdAt: new Date().toISOString(),
        status: "pending",
      });
      const tool = createCancelTaskTool(store);
      const result = await tool.execute({ taskId: "abcdef12" });
      expect(result).toContain("Task cancelled");
    });

    it("rejects cancelling non-pending task", async () => {
      store.add({
        id: "done-task",
        task: "Finished",
        executeAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        status: "completed",
      });
      const tool = createCancelTaskTool(store);
      const result = await tool.execute({ taskId: "done-task" });
      expect(result).toContain("cannot be cancelled");
    });

    it("returns error for unknown task id", async () => {
      const tool = createCancelTaskTool(store);
      const result = await tool.execute({ taskId: "unknown" });
      expect(result).toContain("No task found");
    });
  });
});
