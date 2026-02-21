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
      "Read one of the agent's memory files (SOUL, PERSONALITY, USER, MEMORY, or HEARTBEAT).",
    parameters,
    permission: "read",
    execute: async (args) => {
      let filePath: string;
      if (PER_USER_FILES.has(args.filename) && userDir) {
        // Try per-user dir first, fall back to workspace root
        const userPath = resolve(userDir, args.filename);
        filePath = existsSync(userPath) ? userPath : resolve(workspacePath, args.filename);
      } else {
        filePath = resolve(workspacePath, args.filename);
      }

      if (!existsSync(filePath)) {
        return `File ${args.filename} does not exist.`;
      }

      return readFileSync(filePath, "utf-8");
    },
  };
}
