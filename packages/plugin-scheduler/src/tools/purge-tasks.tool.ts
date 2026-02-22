import { z } from "zod";
import type { ToolDefinition } from "@baseagent/core";
import type { TaskStore } from "../task-store.js";

export function createPurgeTasksTool(store: TaskStore): ToolDefinition {
  return {
    name: "purge_scheduled_tasks",
    description:
      "Delete scheduled tasks. Either delete a single task by ID (any status) or bulk-delete by status. " +
      "Exactly one of taskId or status must be provided.",
    permission: "write",
    parameters: z.object({
      taskId: z.string().optional().describe("Delete a single task by ID (or prefix). Works for any status."),
      status: z.enum(["completed", "failed", "all"]).optional().describe("Bulk delete: 'completed', 'failed', or 'all'."),
    }),
    async execute(args) {
      if (args.taskId && args.status) {
        return "Error: Provide either taskId or status, not both.";
      }
      if (!args.taskId && !args.status) {
        return "Error: Provide either taskId or status.";
      }

      if (args.taskId) {
        const tasks = store.getAll();
        const match = tasks.find(
          (t) => t.id === args.taskId || t.id.startsWith(args.taskId!),
        );
        if (!match) {
          return `Error: No task found with ID starting with "${args.taskId}".`;
        }
        store.remove(match.id);
        return `Deleted task: ${match.task} (id: ${match.id.slice(0, 8)}…, was ${match.status})`;
      }

      if (args.status === "all") {
        const count = store.clear();
        return `Deleted all ${count} task(s).`;
      }

      const count = store.removeByStatus(args.status!);
      return `Deleted ${count} ${args.status} task(s).`;
    },
  };
}
