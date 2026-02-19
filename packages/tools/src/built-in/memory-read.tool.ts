import { z } from "zod";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { ToolDefinition } from "@baseagent/core";

const ALLOWED_FILES = ["SOUL.md", "PERSONALITY.md", "USER.md", "MEMORY.md", "HEARTBEAT.md"] as const;

/** Files that are per-user when a userDir is provided. */
const PER_USER_FILES = new Set(["USER.md", "MEMORY.md"]);

const parameters = z.object({
  filename: z
    .enum(ALLOWED_FILES)
    .describe("The memory file to read: SOUL.md, PERSONALITY.md, USER.md, MEMORY.md, or HEARTBEAT.md"),
});

/**
 * @param workspacePath - Shared workspace root for agent-level files (SOUL.md, PERSONALITY.md, HEARTBEAT.md).
 * @param userDir - Per-user directory for USER.md and MEMORY.md. Falls back to workspacePath.
 */
export function createMemoryReadTool(workspacePath: string, userDir?: string): ToolDefinition<typeof parameters> {
  return {
    name: "memory_read",
    description:
      "Read the contents of one of the agent's memory files. Available files: SOUL.md (identity & boundaries), PERSONALITY.md (voice & character), USER.md (user preferences), MEMORY.md (accumulated context), HEARTBEAT.md (scheduled tasks).",
    parameters,
    permission: "read",
    execute: async (args) => {
      const baseDir = (PER_USER_FILES.has(args.filename) && userDir) ? userDir : workspacePath;
      const filePath = resolve(baseDir, args.filename);

      if (!existsSync(filePath)) {
        return `File ${args.filename} does not exist.`;
      }

      return readFileSync(filePath, "utf-8");
    },
  };
}
