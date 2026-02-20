import { z } from "zod";
import type { ToolDefinition } from "@baseagent/core";
import type { TaskStore } from "../task-store.js";

export function createListTasksTool(store: TaskStore): ToolDefinition {
  return {
    name: "list_scheduled_tasks",
    description: "List all scheduled tasks and their statuses.",
    permission: "read",
    parameters: z.object({}),
    async execute() {
      const tasks = store.getAll();
      if (tasks.length === 0) {
        return "No scheduled tasks.";
      }

      const lines = tasks.map((t) => {
        const at = new Date(t.executeAt);
        const relative = at.getTime() > Date.now()
          ? `in ${Math.round((at.getTime() - Date.now()) / 60_000)} min`
          : "overdue";
        return `- [${t.status}] ${t.task} (id: ${t.id.slice(0, 8)}…, at: ${t.executeAt}, ${relative}${t.channelId ? `, channel: ${t.channelId}` : ""})`;
      });

      return lines.join("\n");
    },
  };
}
