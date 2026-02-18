import { z } from "zod";
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ToolDefinition } from "@baseagent/core";

const WRITABLE_FILES = ["MEMORY.md", "USER.md"] as const;

const parameters = z.object({
  filename: z
    .enum(WRITABLE_FILES)
    .describe("The memory file to write to: MEMORY.md or USER.md"),
  content: z
    .string()
    .describe("The content to append to the file. Will be prefixed with a timestamp."),
});

export function createMemoryWriteTool(workspacePath: string): ToolDefinition<typeof parameters> {
  return {
    name: "memory_write",
    description:
      "Append a timestamped entry to one of the agent's writable memory files. Only MEMORY.md and USER.md can be written to. SOUL.md and HEARTBEAT.md are read-only.",
    parameters,
    permission: "write",
    execute: async (args) => {
      const filePath = resolve(workspacePath, args.filename);
      const timestamp = new Date().toISOString();
      const entry = `\n\n## ${timestamp}\n\n${args.content}`;

      if (!existsSync(filePath)) {
        writeFileSync(filePath, `# ${args.filename.replace(".md", "")}\n${entry}`, "utf-8");
      } else {
        appendFileSync(filePath, entry, "utf-8");
      }

      return `Successfully appended to ${args.filename}`;
    },
  };
}
