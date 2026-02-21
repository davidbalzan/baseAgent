import { resolve } from "node:path";
import { Hono } from "hono";
import type {
  Plugin,
  PluginContext,
  PluginCapabilities,
  PluginAfterInitContext,
  DashboardTab,
} from "@baseagent/core";
import { TaskStore } from "./task-store.js";
import { createScheduleTaskTool } from "./tools/schedule-task.tool.js";
import { createListTasksTool } from "./tools/list-tasks.tool.js";
import { createCancelTaskTool } from "./tools/cancel-task.tool.js";
import { schedulerDashboardTab } from "./dashboard-tab.js";
import { createTaskScheduler, type TaskScheduler } from "./scheduler.js";

export { TaskStore } from "./task-store.js";
export type { ScheduledTask } from "./task-store.js";
export { createScheduleTaskTool } from "./tools/schedule-task.tool.js";

export function createSchedulerPlugin(): Plugin {
  let store: TaskStore | null = null;
  let scheduler: TaskScheduler | null = null;

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
        docs: [{
          title: "Scheduler",
          filename: "SCHEDULER.md",
          content: [
            "# Scheduler Plugin",
            "",
            "Schedule tasks to be executed at a future time. Tasks are stored in `workspace/SCHEDULED_TASKS.json` and executed as agent sessions when their scheduled time arrives.",
            "",
            "## Tools",
            "",
            "| Tool | Permission | Description |",
            "|------|-----------|-------------|",
            "| `schedule_task` | write | Schedule a task for future execution. Accepts `task` (description) and `executeAt` (ISO 8601 datetime). |",
            "| `list_scheduled_tasks` | read | List all scheduled tasks with their status. |",
            "| `cancel_scheduled_task` | write | Cancel a pending task by its ID. |",
            "",
            "## Task Lifecycle",
            "",
            "1. **pending** — Task is waiting for its `executeAt` time",
            "2. **running** — Task is currently being executed as an agent session",
            "3. **completed** — Task finished successfully",
            "4. **failed** — Task execution encountered an error",
            "",
            "## API",
            "",
            "- `GET /scheduler/tasks` — Returns all tasks sorted by creation date (newest first)",
            "",
            "## Dashboard",
            "",
            "The **Tasks** tab in the dashboard displays all scheduled tasks as cards with status badges, execution times, and channel information.",
            "",
            "## Storage",
            "",
            "Tasks are persisted as a JSON array in `workspace/SCHEDULED_TASKS.json`. The file is created automatically on first use.",
          ].join("\n"),
        }],
      };
    },

    async afterInit(ctx: PluginAfterInitContext): Promise<void> {
      if (!store) return;

      const runSession = ctx.createSessionRunner();
      scheduler = createTaskScheduler({
        store,
        runSession,
        sendProactiveMessage: ctx.sendProactiveMessage,
      });
      scheduler.start();
    },

    async shutdown(): Promise<void> {
      scheduler?.stop();
      scheduler = null;
    },
  };
}

/** Access the task store path from workspace (for external use). */
export function createTaskStoreFromWorkspace(workspacePath: string): TaskStore {
  return new TaskStore(resolve(workspacePath, "SCHEDULED_TASKS.json"));
}
