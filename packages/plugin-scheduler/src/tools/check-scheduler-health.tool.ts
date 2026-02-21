import { z } from "zod";
import type { ToolDefinition } from "@baseagent/core";
import type { TaskStore } from "../task-store.js";
import type { TaskScheduler } from "../scheduler.js";

export function createCheckSchedulerHealthTool(
  store: TaskStore,
  getScheduler: () => TaskScheduler | null,
): ToolDefinition {
  return {
    name: "check_scheduler_health",
    description:
      "Check the health and status of the task scheduler. Returns tick stats, task counts by status, delivery outcomes, and any failed deliveries with error details.",
    permission: "read",
    parameters: z.object({}),
    async execute() {
      const scheduler = getScheduler();
      if (!scheduler) return "Scheduler is not initialized.";

      const stats = scheduler.getStats();
      const tasks = store.getAll();

      // Count by status
      const statusCounts: Record<string, number> = {};
      for (const t of tasks) {
        statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1;
      }

      // Count by deliveryStatus
      const deliveryCounts: Record<string, number> = {};
      for (const t of tasks) {
        const ds = t.deliveryStatus ?? "none";
        deliveryCounts[ds] = (deliveryCounts[ds] ?? 0) + 1;
      }

      // Failed deliveries
      const failedDeliveries = tasks
        .filter((t) => t.deliveryStatus === "failed")
        .map((t) => `  - ${t.id.slice(0, 8)}… "${t.task.slice(0, 60)}" error: ${t.error ?? "unknown"}`);

      // Stale running tasks
      const staleRunning = tasks.filter((t) => t.status === "running");

      const lines: string[] = [
        "## Scheduler Health",
        "",
        `**Running:** ${stats.isRunning ? "yes (tick in progress)" : "no"}`,
        `**Last tick:** ${stats.lastTickAt ?? "never"}`,
        `**Tick count:** ${stats.tickCount}`,
        `**Tasks due now:** ${stats.tasksDue}`,
        "",
        "### Tasks by status",
        ...Object.entries(statusCounts).map(([k, v]) => `- ${k}: ${v}`),
        "",
        "### Delivery outcomes",
        ...Object.entries(deliveryCounts).map(([k, v]) => `- ${k}: ${v}`),
      ];

      if (failedDeliveries.length > 0) {
        lines.push("", "### Failed deliveries", ...failedDeliveries);
      }

      if (staleRunning.length > 0) {
        lines.push(
          "",
          `### Stale running tasks (${staleRunning.length})`,
          ...staleRunning.map((t) => `  - ${t.id.slice(0, 8)}… "${t.task.slice(0, 60)}"`),
        );
      }

      return lines.join("\n");
    },
  };
}
