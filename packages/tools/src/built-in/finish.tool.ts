import { z } from "zod";
import type { ToolDefinition } from "@baseagent/core";

const parameters = z.object({
  summary: z
    .string()
    .describe("A concise summary of what was accomplished and any final notes for the user."),
});

export const finishTool: ToolDefinition<typeof parameters> = {
  name: "finish",
  description:
    "Signal that the current task is complete. Call this when you have finished fulfilling the user's request. Provide a summary of what was accomplished.",
  parameters,
  permission: "read",
  execute: async (args) => {
    // The loop intercepts this tool — execute is a no-op fallback
    return args.summary;
  },
};
