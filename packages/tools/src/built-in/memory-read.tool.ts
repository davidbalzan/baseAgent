import { z } from "zod";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { ToolDefinition } from "@baseagent/core";

const ALLOWED_FILES = ["SOUL.md", "USER.md", "MEMORY.md", "HEARTBEAT.md"] as const;

const parameters = z.object({
  filename: z
    .enum(ALLOWED_FILES)
    .describe("The memory file to read: SOUL.md, USER.md, MEMORY.md, or HEARTBEAT.md"),
});

export function createMemoryReadTool(workspacePath: string): ToolDefinition<typeof parameters> {
  return {
    name: "memory_read",
    description:
      "Read the contents of one of the agent's memory files. Available files: SOUL.md (personality & boundaries), USER.md (user preferences), MEMORY.md (accumulated context), HEARTBEAT.md (scheduled tasks).",
    parameters,
    permission: "read",
    execute: async (args) => {
      const filePath = resolve(workspacePath, args.filename);

      if (!existsSync(filePath)) {
        return `File ${args.filename} does not exist.`;
      }

      return readFileSync(filePath, "utf-8");
    },
  };
}
