import { z } from "zod";
import type { ToolDefinition } from "@baseagent/core";

const parameters = z.object({
  message: z.string().describe("The message to echo back."),
});

const tool: ToolDefinition<typeof parameters> = {
  name: "echo",
  description: "Echo a message back. Useful for testing that the tool system works.",
  parameters,
  execute: async (args) => {
    return `Echo: ${args.message}`;
  },
};

export default tool;
