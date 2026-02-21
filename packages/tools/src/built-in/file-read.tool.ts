import { z } from "zod";
import { readFileSync } from "node:fs";
import type { ToolDefinition } from "@baseagent/core";
import { resolveScopedPath } from "./_utils.js";

const parameters = z.object({
  path: z
    .string()
    .describe(
      "File path relative to the workspace root, or prefixed with `project:` to read from the project (repo) root. " +
      "Examples: `notes.txt` (workspace), `project:packages/core/src/index.ts` (project).",
    ),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Line number to start reading from (0-based). Omit to read from the beginning."),
  limit: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Maximum number of lines to return. Omit to read to the end."),
});

export function createFileReadTool(workspacePath: string, projectRootPath?: string): ToolDefinition<typeof parameters> {
  return {
    name: "file_read",
    description:
      "Read a file. Paths are relative to the workspace by default. " +
      "Use the `project:` prefix to read files from the project root (e.g. source code, configs). " +
      "Supports line-based offset/limit for large files.",
    parameters,
    permission: "read",
    timeoutMs: 5_000,
    maxOutputChars: 50_000,
    execute: async (args) => {
      const { resolved, scope } = resolveScopedPath(workspacePath, projectRootPath, args.path);
      const buffer = readFileSync(resolved);

      // Binary detection: check for null bytes in first 512 bytes
      const sample = buffer.subarray(0, 512);
      if (sample.includes(0)) {
        return `Error: "${args.path}" appears to be a binary file.`;
      }

      const content = buffer.toString("utf-8");
      const lines = content.split("\n");

      const start = args.offset ?? 0;
      const end = args.limit !== undefined ? start + args.limit : lines.length;
      const slice = lines.slice(start, end);

      const scopeTag = scope === "project" ? " [project]" : "";
      const header = `[${args.path}]${scopeTag} lines ${start}-${Math.min(end, lines.length) - 1} of ${lines.length}`;
      return `${header}\n${slice.join("\n")}`;
    },
  };
}
