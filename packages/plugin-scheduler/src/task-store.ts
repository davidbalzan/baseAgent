import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface ScheduledTask {
  id: string;
  task: string;
  executeAt: string;
  channelId?: string;
  createdAt: string;
  status: "pending" | "running" | "completed" | "failed";
  deliveryStatus?: "pending" | "delivered" | "failed" | "skipped";
  error?: string;
  completedAt?: string;
}

export class TaskStore {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  private read(): ScheduledTask[] {
    try {
      const raw = readFileSync(this.filePath, "utf-8");
      return JSON.parse(raw) as ScheduledTask[];
    } catch {
      return [];
    }
  }

  private write(tasks: ScheduledTask[]): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(tasks, null, 2), "utf-8");
  }

  add(task: ScheduledTask): { id: string; deduplicated: boolean } {
    const tasks = this.read();
    const existing = this.findDuplicate(tasks, task);
    if (existing) {
      return { id: existing.id, deduplicated: true };
    }
    tasks.push(task);
    this.write(tasks);
    return { id: task.id, deduplicated: false };
  }

  private findDuplicate(tasks: ScheduledTask[], incoming: ScheduledTask): ScheduledTask | undefined {
    const incomingExecMs = new Date(incoming.executeAt).getTime();
    const incomingCreatedMs = new Date(incoming.createdAt).getTime();
    const WINDOW_MS = 60_000;
    return tasks.find((t) => {
      if (t.task !== incoming.task) return false;
      if (new Date(t.executeAt).getTime() !== incomingExecMs) return false;
      const createdDiff = Math.abs(new Date(t.createdAt).getTime() - incomingCreatedMs);
      return createdDiff <= WINDOW_MS;
    });
  }

  removeByStatus(status: string): number {
    const tasks = this.read();
    const remaining = tasks.filter((t) => t.status !== status);
    const count = tasks.length - remaining.length;
    if (count > 0) this.write(remaining);
    return count;
  }

  clear(): number {
    const tasks = this.read();
    const count = tasks.length;
    if (count > 0) this.write([]);
    return count;
  }

  getAll(): ScheduledTask[] {
    return this.read();
  }

  getPending(): ScheduledTask[] {
    return this.read().filter((t) => t.status === "pending");
  }

  getDue(now: Date): ScheduledTask[] {
    const nowMs = now.getTime();
    return this.read().filter(
      (t) => t.status === "pending" && new Date(t.executeAt).getTime() <= nowMs,
    );
  }

  updateStatus(id: string, status: ScheduledTask["status"]): boolean {
    const tasks = this.read();
    const task = tasks.find((t) => t.id === id);
    if (!task) return false;
    task.status = status;
    this.write(tasks);
    return true;
  }

  remove(id: string): boolean {
    const tasks = this.read();
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    tasks.splice(idx, 1);
    this.write(tasks);
    return true;
  }

  update(id: string, partial: Partial<Omit<ScheduledTask, "id">>): boolean {
    const tasks = this.read();
    const task = tasks.find((t) => t.id === id);
    if (!task) return false;
    Object.assign(task, partial);
    this.write(tasks);
    return true;
  }

  markStaleRunningAsFailed(): number {
    const tasks = this.read();
    let count = 0;
    for (const t of tasks) {
      if (t.status === "running") {
        t.status = "failed";
        t.error = "Marked stale on startup (was still running)";
        count++;
      }
    }
    if (count > 0) this.write(tasks);
    return count;
  }

  getRecent(limit: number = 10): ScheduledTask[] {
    return this.read()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
}
