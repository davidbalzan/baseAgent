import { z } from "zod";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { ToolDefinition } from "@baseagent/core";
import { resolveScopedPath } from "./_utils.js";

const parameters = z.object({
  path: z
    .string()
    .optional()
    .default(".")
    .describe(
      "Directory path relative to the workspace root, or prefixed with `project:` to list from the project root. " +
      "Examples: `.` (workspace root), `project:packages` (project packages dir). Defaults to workspace root.",
    ),
  recursive: z
    .boolean()
    .optional()
    .default(false)
    .describe("If true, list files recursively. Capped at 500 entries."),
});

const MAX_ENTRIES = 500;

/** Directories to skip when listing under the project root to avoid noise. */
const PROJECT_SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".turbo", ".next", ".cache"]);

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

export function createFileListTool(workspacePath: string, projectRootPath?: string): ToolDefinition<typeof parameters> {
  return {
    name: "file_list",
    description:
      "List files and directories. Paths are relative to the workspace by default. " +
      "Use the `project:` prefix to list files from the project root (e.g. source code). " +
      "Use recursive=true for deep listing (max 500 entries). " +
      "Project listings automatically skip node_modules, .git, dist, and cache directories.",
    parameters,
    permission: "read",
    timeoutMs: 5_000,
    maxOutputChars: 20_000,
    execute: async (args) => {
      const { resolved: dirPath, scope } = resolveScopedPath(workspacePath, projectRootPath, args.path);
      const baseDir = scope === "project" ? projectRootPath! : workspacePath;
      const entries: string[] = [];

      function walk(dir: string): void {
        if (entries.length >= MAX_ENTRIES) return;

        const items = readdirSync(dir);
        for (const item of items) {
          if (entries.length >= MAX_ENTRIES) return;

          const fullPath = join(dir, item);
          const relPath = relative(baseDir, fullPath);

          try {
            const stat = statSync(fullPath);
            if (stat.isDirectory()) {
              // Skip noisy directories in project scope
              if (scope === "project" && PROJECT_SKIP_DIRS.has(item)) continue;
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

      const scopeTag = scope === "project" ? " [project]" : "";
      const header = `[${args.path}]${scopeTag} ${entries.length} entries${entries.length >= MAX_ENTRIES ? " (capped at 500)" : ""}`;
      return `${header}\n${entries.join("\n")}`;
    },
  };
}
