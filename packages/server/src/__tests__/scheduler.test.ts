import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TaskStore } from "@baseagent/plugin-scheduler";
import { createTaskScheduler } from "@baseagent/plugin-scheduler/scheduler";

describe("createTaskScheduler", () => {
  let dir: string;
  let store: TaskStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "scheduler-timer-test-"));
    store = new TaskStore(join(dir, "tasks.json"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("does nothing when no tasks are due", async () => {
    const runSession = vi.fn();
    const scheduler = createTaskScheduler({ store, runSession });

    store.add({
      id: "future-task",
      task: "Check something",
      executeAt: new Date(Date.now() + 600_000).toISOString(),
      createdAt: new Date().toISOString(),
      status: "pending",
    });

    await scheduler.tick();
    expect(runSession).not.toHaveBeenCalled();
  });

  it("executes due tasks and marks them completed", async () => {
    const runSession = vi.fn().mockResolvedValue({
      sessionId: "test-session",
      output: "Done checking.",
    });
    const scheduler = createTaskScheduler({ store, runSession });

    store.add({
      id: "due-task",
      task: "Check the weather",
      executeAt: new Date(Date.now() - 60_000).toISOString(),
      createdAt: new Date().toISOString(),
      status: "pending",
    });

    await scheduler.tick();
    expect(runSession).toHaveBeenCalledTimes(1);
    const tasks = store.getAll();
    expect(tasks[0].status).toBe("completed");
  });

  it("marks task as failed when runSession throws", async () => {
    const runSession = vi.fn().mockRejectedValue(new Error("API down"));
    const scheduler = createTaskScheduler({ store, runSession });

    store.add({
      id: "fail-task",
      task: "Do something",
      executeAt: new Date(Date.now() - 60_000).toISOString(),
      createdAt: new Date().toISOString(),
      status: "pending",
    });

    await scheduler.tick();
    const tasks = store.getAll();
    expect(tasks[0].status).toBe("failed");
  });

  it("sends proactive message when channelId is set", async () => {
    const sendProactiveMessage = vi.fn().mockResolvedValue(undefined);
    const runSession = vi.fn().mockResolvedValue({
      sessionId: "test",
      output: "Weather is sunny.",
    });
    const scheduler = createTaskScheduler({ store, runSession, sendProactiveMessage });

    store.add({
      id: "channel-task",
      task: "Check the weather",
      executeAt: new Date(Date.now() - 60_000).toISOString(),
      channelId: "telegram:12345",
      createdAt: new Date().toISOString(),
      status: "pending",
    });

    await scheduler.tick();
    expect(sendProactiveMessage).toHaveBeenCalledWith("telegram:12345", "Weather is sunny.");
  });

  it("prevents overlapping ticks", async () => {
    let resolveFirst!: (value: unknown) => void;
    const runSession = vi.fn().mockImplementation(
      () => new Promise((resolve) => { resolveFirst = resolve; }),
    );
    const scheduler = createTaskScheduler({ store, runSession });

    store.add({
      id: "overlap-task",
      task: "Slow task",
      executeAt: new Date(Date.now() - 60_000).toISOString(),
      createdAt: new Date().toISOString(),
      status: "pending",
    });

    const firstTick = scheduler.tick();
    await scheduler.tick(); // Should be skipped
    expect(runSession).toHaveBeenCalledTimes(1);

    resolveFirst({ sessionId: "t", output: "Done" });
    await firstTick;
  });

  it("start/stop manage interval", () => {
    const scheduler = createTaskScheduler({
      store,
      runSession: vi.fn(),
      intervalMs: 60_000,
    });

    scheduler.start();
    scheduler.stop();
  });
});
