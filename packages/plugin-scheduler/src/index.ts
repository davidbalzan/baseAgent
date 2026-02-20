import { resolve } from "node:path";
import { Hono } from "hono";
import type {
  Plugin,
  PluginContext,
  PluginCapabilities,
  DashboardTab,
} from "@baseagent/core";
import { TaskStore } from "./task-store.js";
import { createScheduleTaskTool } from "./tools/schedule-task.tool.js";
import { createListTasksTool } from "./tools/list-tasks.tool.js";
import { createCancelTaskTool } from "./tools/cancel-task.tool.js";
import { schedulerDashboardTab } from "./dashboard-tab.js";

export { TaskStore } from "./task-store.js";
export type { ScheduledTask } from "./task-store.js";
export { createScheduleTaskTool } from "./tools/schedule-task.tool.js";

export function createSchedulerPlugin(): Plugin {
  let store: TaskStore | null = null;

  return {
    name: "scheduler",
    phase: "services",

    async init(ctx: PluginContext): Promise<PluginCapabilities | null> {
      const filePath = resolve(ctx.workspacePath, "SCHEDULED_TASKS.json");
      store = new TaskStore(filePath);

      ctx.log("[scheduler] Plugin enabled");

      // HTTP routes for the scheduler API
      const app = new Hono();
      app.get("/tasks", (c) => {
        const tasks = store!.getAll()
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return c.json({ tasks });
      });

      return {
        tools: [
          createScheduleTaskTool(store),
          createListTasksTool(store),
          createCancelTaskTool(store),
        ],
        routes: app,
        routePrefix: "/scheduler",
        dashboardTabs: [schedulerDashboardTab],
      };
    },
  };
}

/** Access the task store path from workspace (for the timer). */
export function createTaskStoreFromWorkspace(workspacePath: string): TaskStore {
  return new TaskStore(resolve(workspacePath, "SCHEDULED_TASKS.json"));
}
