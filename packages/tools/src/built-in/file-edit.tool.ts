import { z } from "zod";
import { readFileSync, writeFileSync } from "node:fs";
import type { ToolDefinition } from "@baseagent/core";
import { resolveWorkspacePath } from "./_utils.js";

const parameters = z.object({
  path: z
    .string()
    .describe("File path relative to the workspace root."),
  old_string: z
    .string()
    .describe(
      "The exact string to find in the file. Must match verbatim (including whitespace/indentation) and appear exactly once.",
    ),
  new_string: z
    .string()
    .describe(
      "The replacement string. Use an empty string to delete the matched text.",
    ),
});

export function createFileEditTool(workspacePath: string): ToolDefinition<typeof parameters> {
  return {
    name: "file_edit",
    description:
      "Edit an existing file by replacing an exact string match. The old_string must appear exactly once in the file. Read the file first to get current content before editing.",
    parameters,
    timeoutMs: 5_000,
    execute: async (args) => {
      const filePath = resolveWorkspacePath(workspacePath, args.path);

      // Read existing file — must exist
      let content: string;
      try {
        content = readFileSync(filePath, "utf-8");
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          return `Error: file not found at ${args.path}`;
        }
        throw err;
      }

      // Count occurrences
      const occurrences = content.split(args.old_string).length - 1;

      if (occurrences === 0) {
        return `Error: search string not found in ${args.path}. Read the file first to get current content.`;
      }

      if (occurrences > 1) {
        return `Error: search string found ${occurrences} times in ${args.path}. Provide more surrounding context to make the match unique.`;
      }

      // Replace the single occurrence
      const updated = content.replace(args.old_string, args.new_string);
      writeFileSync(filePath, updated, "utf-8");

      // Compute affected line range for confirmation
      const idx = content.indexOf(args.old_string);
      const lineStart = content.substring(0, idx).split("\n").length;
      const linesRemoved = args.old_string.split("\n").length;
      const linesAdded = args.new_string.split("\n").length;

      return `Edited ${args.path}: replaced ${linesRemoved} line(s) with ${linesAdded} line(s) starting at line ${lineStart}.`;
    },
  };
}
