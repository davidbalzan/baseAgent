import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TaskStore, type ScheduledTask } from "../task-store.js";

describe("TaskStore", () => {
  let dir: string;
  let store: TaskStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "scheduler-test-"));
    store = new TaskStore(join(dir, "tasks.json"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function makeTask(overrides: Partial<ScheduledTask> = {}): ScheduledTask {
    return {
      id: "test-id-1",
      task: "Check the weather",
      executeAt: new Date(Date.now() + 60_000).toISOString(),
      createdAt: new Date().toISOString(),
      status: "pending",
      ...overrides,
    };
  }

  it("returns empty array when file does not exist", () => {
    expect(store.getAll()).toEqual([]);
  });

  it("adds and retrieves tasks", () => {
    const task = makeTask();
    store.add(task);
    const all = store.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe("test-id-1");
  });

  it("getPending returns only pending tasks", () => {
    store.add(makeTask({ id: "a", status: "pending" }));
    store.add(makeTask({ id: "b", status: "completed" }));
    store.add(makeTask({ id: "c", status: "failed" }));
    expect(store.getPending()).toHaveLength(1);
    expect(store.getPending()[0].id).toBe("a");
  });

  it("getDue returns pending tasks whose executeAt <= now", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 60_000).toISOString();
    store.add(makeTask({ id: "past", executeAt: past }));
    store.add(makeTask({ id: "future", executeAt: future }));
    store.add(makeTask({ id: "done", executeAt: past, status: "completed" }));

    const due = store.getDue(new Date());
    expect(due).toHaveLength(1);
    expect(due[0].id).toBe("past");
  });

  it("updateStatus changes task status", () => {
    store.add(makeTask({ id: "x" }));
    expect(store.updateStatus("x", "running")).toBe(true);
    expect(store.getAll()[0].status).toBe("running");
  });

  it("updateStatus returns false for unknown id", () => {
    expect(store.updateStatus("nonexistent", "running")).toBe(false);
  });

  it("remove deletes a task", () => {
    store.add(makeTask({ id: "r1" }));
    store.add(makeTask({ id: "r2" }));
    expect(store.remove("r1")).toBe(true);
    expect(store.getAll()).toHaveLength(1);
    expect(store.getAll()[0].id).toBe("r2");
  });

  it("remove returns false for unknown id", () => {
    expect(store.remove("nonexistent")).toBe(false);
  });
});
