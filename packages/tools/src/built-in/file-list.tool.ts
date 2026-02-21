import { z } from "zod";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { ToolDefinition } from "@baseagent/core";
import { resolveWorkspacePath } from "./_utils.js";

const parameters = z.object({
  path: z
    .string()
    .optional()
    .default(".")
    .describe("Directory path relative to the workspace root. Defaults to workspace root."),
  recursive: z
    .boolean()
    .optional()
    .default(false)
    .describe("If true, list files recursively. Capped at 500 entries."),
});

const MAX_ENTRIES = 500;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

export function createFileListTool(workspacePath: string): ToolDefinition<typeof parameters> {
  return {
    name: "file_list",
    description:
      "List files and directories in the workspace with sizes. Use recursive=true for deep listing (max 500 entries).",
    parameters,
    permission: "read",
    timeoutMs: 5_000,
    maxOutputChars: 20_000,
    execute: async (args) => {
      const dirPath = resolveWorkspacePath(workspacePath, args.path);
      const entries: string[] = [];

      function walk(dir: string): void {
        if (entries.length >= MAX_ENTRIES) return;

        const items = readdirSync(dir);
        for (const item of items) {
          if (entries.length >= MAX_ENTRIES) return;

          const fullPath = join(dir, item);
          const relPath = relative(workspacePath, fullPath);

          try {
            const stat = statSync(fullPath);
            if (stat.isDirectory()) {
              entries.push(`[DIR]  ${relPath}/`);
              if (args.recursive) walk(fullPath);
            } else {
              entries.push(`[FILE] ${relPath} (${formatSize(stat.size)})`);
            }
          } catch {
            entries.push(`[ERR]  ${relPath} (unreadable)`);
          }
        }
      }

      walk(dirPath);

      const header = `[${args.path}] ${entries.length} entries${entries.length >= MAX_ENTRIES ? " (capped at 500)" : ""}`;
      return `${header}\n${entries.join("\n")}`;
    },
  };
}
