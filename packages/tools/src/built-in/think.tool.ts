import { z } from "zod";
import type { ToolDefinition } from "@baseagent/core";

const parameters = z.object({
  thought: z.string().describe("Your reasoning, plan, or scratchpad content."),
});

export const thinkTool: ToolDefinition<typeof parameters> = {
  name: "think",
  description:
    "Private scratchpad for reasoning and planning before acting. No side effects.",
  parameters,
  permission: "read",
  execute: async (args) => args.thought,
};
