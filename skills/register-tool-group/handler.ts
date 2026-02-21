import { z } from "zod";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { ToolDefinition } from "@baseagent/core";

const parameters = z.object({
  group: z.string().describe("Name of the conditional tool group (e.g. 'calendar', 'data')."),
  keywords: z
    .array(z.string())
    .min(1)
    .describe("Keywords that trigger this group's tools to be included in the session."),
});

interface SkillContext {
  workspacePath: string;
}

export default function createTool(ctx: SkillContext): ToolDefinition<typeof parameters> {
  const groupsPath = join(ctx.workspacePath, "tool-groups.json");

  return {
    name: "register_tool_group",
    description:
      "Register a conditional tool group so that tools in that group are only included " +
      "when the user's input matches one of the specified keywords. " +
      "This reduces prompt token usage by filtering out irrelevant tools. " +
      "Takes effect on the next session.",
    parameters,
    permission: "write" as const,
    execute: async (args) => {
      const { group, keywords } = args;

      let existing: Record<string, string[]> = {};
      if (existsSync(groupsPath)) {
        try {
          existing = JSON.parse(readFileSync(groupsPath, "utf-8"));
        } catch {
          existing = {};
        }
      }

      const isUpdate = group in existing;
      existing[group] = keywords;

      writeFileSync(groupsPath, JSON.stringify(existing, null, 2) + "\n", "utf-8");

      const action = isUpdate ? "Updated" : "Registered";
      return (
        `${action} tool group "${group}" with ${keywords.length} keywords: ${keywords.join(", ")}. ` +
        `Tools with group="${group}" will only be included when input matches these keywords. ` +
        `Takes effect on the next session.`
      );
    },
  };
}
