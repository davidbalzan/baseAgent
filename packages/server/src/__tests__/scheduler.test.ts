import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TaskStore } from "@baseagent/plugin-scheduler";
import { createTaskScheduler, type TaskSchedulerDeps } from "../scheduler.js";
import type { RunSessionDeps, RunSessionResult } from "../run-session.js";

function makeSessionResult(output: string): RunSessionResult {
  return {
    sessionId: "test-session",
    output,
    state: {
      status: "completed",
      iteration: 1,
      totalTokens: 100,
      promptTokens: 80,
      completionTokens: 20,
      estimatedCostUsd: 0.001,
    } as any,
  };
}

describe("createTaskScheduler", () => {
  let dir: string;
  let store: TaskStore;
  const mockSessionDeps = {} as RunSessionDeps;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "scheduler-timer-test-"));
    store = new TaskStore(join(dir, "tasks.json"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("does nothing when no tasks are due", async () => {
    const runSessionFn = vi.fn();
    const scheduler = createTaskScheduler({
      store,
      sessionDeps: mockSessionDeps,
      runSessionFn,
    });

    store.add({
      id: "future-task",
      task: "Check something",
      executeAt: new Date(Date.now() + 600_000).toISOString(),
      createdAt: new Date().toISOString(),
      status: "pending",
    });

    await scheduler.tick();
    expect(runSessionFn).not.toHaveBeenCalled();
  });

  it("executes due tasks and marks them completed", async () => {
    const runSessionFn = vi.fn().mockResolvedValue(makeSessionResult("Done checking."));
    const scheduler = createTaskScheduler({
      store,
      sessionDeps: mockSessionDeps,
      runSessionFn,
    });

    store.add({
      id: "due-task",
      task: "Check the weather",
      executeAt: new Date(Date.now() - 60_000).toISOString(),
      createdAt: new Date().toISOString(),
      status: "pending",
    });

    await scheduler.tick();
    expect(runSessionFn).toHaveBeenCalledTimes(1);
    const tasks = store.getAll();
    expect(tasks[0].status).toBe("completed");
  });

  it("marks task as failed when runSession throws", async () => {
    const runSessionFn = vi.fn().mockRejectedValue(new Error("API down"));
    const scheduler = createTaskScheduler({
      store,
      sessionDeps: mockSessionDeps,
      runSessionFn,
    });

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
    const runSessionFn = vi.fn().mockResolvedValue(makeSessionResult("Weather is sunny."));
    const scheduler = createTaskScheduler({
      store,
      sessionDeps: mockSessionDeps,
      runSessionFn,
      sendProactiveMessage,
    });

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
    let resolveFirst!: (value: RunSessionResult) => void;
    const runSessionFn = vi.fn().mockImplementation(
      () => new Promise<RunSessionResult>((resolve) => { resolveFirst = resolve; }),
    );
    const scheduler = createTaskScheduler({
      store,
      sessionDeps: mockSessionDeps,
      runSessionFn,
    });

    store.add({
      id: "overlap-task",
      task: "Slow task",
      executeAt: new Date(Date.now() - 60_000).toISOString(),
      createdAt: new Date().toISOString(),
      status: "pending",
    });

    const firstTick = scheduler.tick();
    await scheduler.tick(); // Should be skipped
    expect(runSessionFn).toHaveBeenCalledTimes(1);

    resolveFirst(makeSessionResult("Done"));
    await firstTick;
  });

  it("start/stop manage interval", () => {
    const scheduler = createTaskScheduler({
      store,
      sessionDeps: mockSessionDeps,
      runSessionFn: vi.fn(),
      intervalMs: 60_000,
    });

    scheduler.start();
    scheduler.stop();
    // No assertions needed — just verify it doesn't throw
  });
});
