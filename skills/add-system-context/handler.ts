import { z } from "zod";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import type { ToolDefinition } from "@baseagent/core";

const parameters = z.object({
  key: z.string().describe("Unique identifier for this context entry. Used for idempotent updates."),
  content: z.string().describe("Markdown text to add to the system prompt context."),
});

interface SkillContext {
  workspacePath: string;
}

const MARKER_START = (key: string) => `<!-- context-key: ${key} -->`;
const MARKER_END = (key: string) => `<!-- /context-key: ${key} -->`;

export default function createTool(ctx: SkillContext): ToolDefinition<typeof parameters> {
  const contextPath = join(ctx.workspacePath, "CONTEXT.md");

  return {
    name: "add_system_context",
    description:
      "Add or update an entry in the agent's system prompt context (CONTEXT.md). " +
      "Entries are keyed for idempotent updates — calling with the same key replaces the previous value. " +
      "Use this to declare capabilities, record user preferences, or inject plugin instructions.",
    parameters,
    permission: "write" as const,
    execute: async (args) => {
      const { key, content } = args;
      const startMarker = MARKER_START(key);
      const endMarker = MARKER_END(key);
      const block = `${startMarker}\n${content}\n${endMarker}`;

      let existing = "";
      if (existsSync(contextPath)) {
        existing = readFileSync(contextPath, "utf-8");
      } else {
        // Ensure parent directory exists
        mkdirSync(dirname(contextPath), { recursive: true });
        existing = "# Agent Context\n\n";
      }

      // Replace existing block or append
      const startIdx = existing.indexOf(startMarker);
      const endIdx = existing.indexOf(endMarker);

      let updated: string;
      if (startIdx !== -1 && endIdx !== -1) {
        // Replace existing entry
        const before = existing.slice(0, startIdx);
        const after = existing.slice(endIdx + endMarker.length);
        updated = `${before}${block}${after}`;
      } else {
        // Append new entry
        updated = existing.trimEnd() + "\n\n" + block + "\n";
      }

      writeFileSync(contextPath, updated, "utf-8");

      return `Context entry "${key}" saved to CONTEXT.md. It will be included in the system prompt on the next session.`;
    },
  };
}
