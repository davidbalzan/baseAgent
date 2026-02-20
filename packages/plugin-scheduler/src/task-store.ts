import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface ScheduledTask {
  id: string;
  task: string;
  executeAt: string;
  channelId?: string;
  createdAt: string;
  status: "pending" | "running" | "completed" | "failed";
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

  add(task: ScheduledTask): void {
    const tasks = this.read();
    tasks.push(task);
    this.write(tasks);
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
}
