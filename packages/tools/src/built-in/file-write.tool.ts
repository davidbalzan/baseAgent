import { z } from "zod";
import { writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ToolDefinition } from "@baseagent/core";
import { resolveWorkspacePath, assertNotProtectedMemoryFile, parseScopedPath } from "./_utils.js";

const parameters = z.object({
  path: z
    .string()
    .describe("File path relative to the workspace root. The `project:` prefix is NOT allowed for writes."),
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
      "Write or create a file in the workspace. Overwrites by default; set append=true to append. " +
      "Creates parent directories automatically. " +
      "Note: project root files are read-only — the `project:` prefix is not supported here.",
    parameters,
    permission: "write",
    timeoutMs: 5_000,
    execute: async (args) => {
      // Block project-scope writes
      const { scope } = parseScopedPath(args.path);
      if (scope === "project") {
        return "Error: project root files are read-only. file_write only supports workspace paths.";
      }

      const filePath = resolveWorkspacePath(workspacePath, args.path);
      assertNotProtectedMemoryFile(filePath);

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
