import { z } from "zod";
import type { ToolDefinition } from "@baseagent/core";

const parameters = z.object({
  thought: z.string().describe("Your reasoning, plan, or scratchpad content."),
});

export const thinkTool: ToolDefinition<typeof parameters> = {
  name: "think",
  description:
    "Use this tool to reason through a problem before acting. Write out your plan, consider which tools to combine, and think step-by-step. This has no side effects — it is a private scratchpad that helps you produce better results on complex tasks.",
  parameters,
  permission: "read",
  execute: async (args) => args.thought,
};
