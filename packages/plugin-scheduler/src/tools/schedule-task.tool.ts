import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { ToolDefinition } from "@baseagent/core";
import type { TaskStore } from "../task-store.js";

export function createScheduleTaskTool(store: TaskStore, defaultChannelId?: string): ToolDefinition {
  return {
    name: "schedule_task",
    description:
      "Schedule a task to be executed at a future time. The task will be run as an agent session when the specified time arrives. " +
      "Results will automatically be sent back to the current conversation channel. " +
      "Use the ISO timestamp from the system prompt to calculate the correct executeAt value — preserve the timezone offset.",
    permission: "write",
    parameters: z.object({
      task: z.string().describe("Description of what the agent should do when this task fires"),
      executeAt: z.string().describe("ISO 8601 datetime with timezone offset for when to execute (e.g. '2025-01-15T14:30:00+01:00'). Must be in the future."),
      channelId: z.string().optional().describe("Channel to deliver results to. Defaults to the current channel."),
    }),
    async execute(args) {
      const executeAt = new Date(args.executeAt);
      if (isNaN(executeAt.getTime())) {
        return "Error: Invalid date format. Please use ISO 8601 (e.g. '2025-01-15T14:30:00+01:00').";
      }
      if (executeAt.getTime() <= Date.now()) {
        return `Error: executeAt must be in the future. Current server time: ${new Date().toISOString()}.`;
      }

      const channelId = args.channelId ?? defaultChannelId;
      const id = randomUUID();
      const createdAt = new Date();
      const result = store.add({
        id,
        task: args.task,
        executeAt: executeAt.toISOString(),
        channelId,
        createdAt: createdAt.toISOString(),
        status: "pending",
      });

      if (result.deduplicated) {
        return `Task already scheduled (id: ${result.id.slice(0, 8)}…). Duplicate not created.`;
      }

      const delta = executeAt.getTime() - createdAt.getTime();
      const minutes = Math.round(delta / 60_000);
      return `Task scheduled (id: ${id}). Current server time: ${createdAt.toISOString()}. Will execute at ${executeAt.toISOString()} (in ~${minutes} minutes).` +
        (channelId ? ` Results will be sent to ${channelId}.` : "");
    },
  };
}
