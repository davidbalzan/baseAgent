import { z } from "zod";
import type { ToolDefinition } from "@baseagent/core";
import type { TaskStore } from "../task-store.js";

export function createCancelTaskTool(store: TaskStore): ToolDefinition {
  return {
    name: "cancel_scheduled_task",
    description: "Cancel a scheduled task by its ID (or the first 8 characters of the ID).",
    permission: "write",
    parameters: z.object({
      taskId: z.string().describe("The task ID (or prefix) to cancel"),
    }),
    async execute(args) {
      const tasks = store.getAll();
      const match = tasks.find(
        (t) => t.id === args.taskId || t.id.startsWith(args.taskId),
      );

      if (!match) {
        return `Error: No task found with ID starting with "${args.taskId}".`;
      }

      if (match.status !== "pending") {
        return `Error: Task ${match.id.slice(0, 8)}… is "${match.status}" and cannot be cancelled.`;
      }

      store.remove(match.id);
      return `Task cancelled: ${match.task} (id: ${match.id.slice(0, 8)}…)`;
    },
  };
}
