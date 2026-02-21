import { z } from "zod";
import { readFileSync } from "node:fs";
import type { ToolDefinition } from "@baseagent/core";
import { resolveWorkspacePath } from "./_utils.js";

const parameters = z.object({
  path: z
    .string()
    .describe("File path relative to the workspace root."),
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

export function createFileReadTool(workspacePath: string): ToolDefinition<typeof parameters> {
  return {
    name: "file_read",
    description:
      "Read a file in the workspace. Supports line-based offset/limit for large files.",
    parameters,
    permission: "read",
    timeoutMs: 5_000,
    maxOutputChars: 50_000,
    execute: async (args) => {
      const filePath = resolveWorkspacePath(workspacePath, args.path);
      const buffer = readFileSync(filePath);

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

      const header = `[${args.path}] lines ${start}-${Math.min(end, lines.length) - 1} of ${lines.length}`;
      return `${header}\n${slice.join("\n")}`;
    },
  };
}
