import { z } from "zod";
import type { ToolDefinition } from "@baseagent/core";
import { getRecentLogs } from "@baseagent/core";

export function createReadServerLogsTool(): ToolDefinition {
  return {
    name: "read_server_logs",
    description:
      "Read recent server log entries from the in-memory log buffer. " +
      "Useful for diagnosing issues without needing shell access. " +
      "Filter by logger name (e.g. 'scheduler', 'model') or level ('log', 'warn', 'error').",
    permission: "read",
    parameters: z.object({
      name: z.string().optional().describe("Filter by logger name (e.g. 'scheduler', 'model', 'gateway')"),
      level: z.string().optional().describe("Filter by log level: 'log', 'warn', or 'error'"),
      limit: z.number().optional().describe("Maximum number of entries to return (default: 50)"),
    }),
    async execute(args) {
      const entries = getRecentLogs({
        name: args.name,
        level: args.level,
        limit: args.limit ?? 50,
      });

      if (entries.length === 0) {
        return "No log entries found" +
          (args.name ? ` for name="${args.name}"` : "") +
          (args.level ? ` at level="${args.level}"` : "") +
          ".";
      }

      const lines = entries.map(
        (e) => `[${e.timestamp}] ${e.level.toUpperCase().padEnd(5)} [${e.name}] ${e.message}`,
      );

      return `${entries.length} log entries:\n\n${lines.join("\n")}`;
    },
  };
}
