import { z } from "zod";
import type { ToolDefinition } from "@baseagent/core";

export type SessionSearchFn = (
  query: string,
  opts: { channelId?: string; daysBack?: number; limit?: number },
) => Array<{
  id: string;
  input: string;
  output: string | null;
  channelId: string | null;
  createdAt: string;
}>;

const parameters = z.object({
  query: z.string().describe("Keyword to search for in past conversation inputs and outputs"),
  channelId: z.string().optional().describe("Filter results to a specific channel (e.g. 'telegram:123')"),
  daysBack: z.number().int().positive().max(365).optional().describe("How many days back to search (default 30, max 365)"),
  limit: z.number().int().positive().max(50).optional().describe("Max results to return (default 10, max 50)"),
});

export function createSessionSearchTool(searchFn: SessionSearchFn): ToolDefinition<typeof parameters> {
  return {
    name: "session_search",
    description:
      "Search past conversations by keyword. Use this to find previous discussions, " +
      "requests, or topics the user has talked about in earlier sessions.",
    parameters,
    permission: "read",
    execute: async (args) => {
      const results = searchFn(args.query, {
        channelId: args.channelId,
        daysBack: args.daysBack,
        limit: args.limit,
      });

      if (results.length === 0) {
        return `No past conversations found matching "${args.query}".`;
      }

      const lines = results.map((r) => {
        const date = r.createdAt.slice(0, 16).replace("T", " ");
        const channel = r.channelId ? ` [${r.channelId}]` : "";
        const input = r.input.length > 100 ? r.input.slice(0, 100) + "..." : r.input;
        const output = r.output
          ? r.output.length > 200
            ? r.output.slice(0, 200) + "..."
            : r.output
          : "(no output)";
        return `[${date}]${channel} (${r.id})\n  User: ${input}\n  Assistant: ${output}`;
      });

      return `Found ${results.length} conversation(s) matching "${args.query}":\n\n${lines.join("\n\n")}`;
    },
  };
}
