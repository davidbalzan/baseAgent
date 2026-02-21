import { z } from "zod";
import type { ToolDefinition } from "@baseagent/core";

export type ListRecentSessionsFn = (opts: {
  channelId?: string;
  daysBack?: number;
  limit?: number;
}) => Array<{
  id: string;
  input: string;
  output: string | null;
  channelId: string | null;
  createdAt: string;
}>;

const parameters = z.object({
  daysBack: z.number().int().positive().max(30).optional()
    .describe("How many days back to review (default 7, max 30)"),
  channelId: z.string().optional()
    .describe("Filter to a specific channel (e.g. 'telegram:123')"),
  limit: z.number().int().positive().max(50).optional()
    .describe("Max sessions to include (default 20, max 50)"),
});

export function createReviewSessionsTool(listFn: ListRecentSessionsFn): ToolDefinition<typeof parameters> {
  return {
    name: "review_sessions",
    description:
      "Retrieve recent conversations for review. Use this to scan past sessions and identify " +
      "insights worth memorizing — user preferences, recurring interests, corrections, important " +
      "facts shared, or communication style patterns. After reviewing, call memory_write to " +
      "persist key findings to MEMORY.md or USER.md.",
    parameters,
    permission: "read",
    execute: async (args) => {
      const results = listFn({
        channelId: args.channelId,
        daysBack: args.daysBack,
        limit: args.limit,
      });

      if (results.length === 0) {
        const days = args.daysBack ?? 7;
        const channel = args.channelId ? ` in channel ${args.channelId}` : "";
        return `No completed sessions found in the last ${days} day(s)${channel}.`;
      }

      // Reverse to chronological order (oldest first)
      const chronological = [...results].reverse();
      const days = args.daysBack ?? 7;

      const lines = chronological.map((r) => {
        const date = r.createdAt.slice(0, 16).replace("T", " ");
        const channel = r.channelId ? ` [${r.channelId}]` : "";
        const input = r.input.length > 200 ? r.input.slice(0, 200) + "..." : r.input;
        const output = r.output
          ? r.output.length > 300
            ? r.output.slice(0, 300) + "..."
            : r.output
          : "(no output)";
        return `## ${date}${channel}\nUser: ${input}\nAssistant: ${output}`;
      });

      return `# Recent Conversations (${days} days, ${results.length} sessions)\n\n${lines.join("\n\n")}`;
    },
  };
}
