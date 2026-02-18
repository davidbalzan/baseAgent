import { z } from "zod";
import { writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ToolDefinition } from "@baseagent/core";
import { resolveWorkspacePath } from "./_utils.js";

const parameters = z.object({
  path: z
    .string()
    .describe("File path relative to the workspace root."),
  content: z
    .string()
    .describe("The content to write to the file."),
  append: z
    .boolean()
    .optional()
    .default(false)
    .describe("If true, append to the file instead of overwriting. Defaults to false."),
});

export function createFileWriteTool(workspacePath: string): ToolDefinition<typeof parameters> {
  return {
    name: "file_write",
    description:
      "Write or create a file in the workspace. By default overwrites the file; set append=true to append instead. Parent directories are created automatically.",
    parameters,
    permission: "write",
    timeoutMs: 5_000,
    execute: async (args) => {
      const filePath = resolveWorkspacePath(workspacePath, args.path);

      // Ensure parent directories exist
      mkdirSync(dirname(filePath), { recursive: true });

      if (args.append) {
        appendFileSync(filePath, args.content, "utf-8");
      } else {
        writeFileSync(filePath, args.content, "utf-8");
      }

      const bytes = Buffer.byteLength(args.content, "utf-8");
      const action = args.append ? "Appended" : "Wrote";
      return `${action} ${bytes} bytes to ${args.path}`;
    },
  };
}
