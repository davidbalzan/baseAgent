import { z } from "zod";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ToolDefinition } from "@baseagent/core";

const parameters = z.object({
  name: z
    .string()
    .regex(/^[a-z][a-z0-9-]*$/, "Skill name must be lowercase alphanumeric with hyphens")
    .describe("Directory name for the skill (e.g. 'summarize-pdf'). Must be lowercase with hyphens."),
  code: z.string().describe("Full TypeScript source for handler.ts. Must contain 'export default'."),
});

interface SkillContext {
  workspacePath: string;
}

export default function createTool(ctx: SkillContext): ToolDefinition<typeof parameters> {
  const skillsDir = resolve(ctx.workspacePath, "..", "skills");

  return {
    name: "create_skill",
    description:
      "Create a new skill by writing a handler.ts file to the skills directory. " +
      "The code must default-export a ToolDefinition or a factory function (ctx) => ToolDefinition. " +
      "Use this for single-skill scaffolding. For broader/multi-file repo changes, use self_enhance. " +
      "After creating or editing a skill, ALWAYS run reload_skills (tool call, not a shell script) and only report success when reload has zero failures and skills typecheck passes.",
    parameters,
    permission: "exec" as const,
    execute: async (args) => {
      const { name, code } = args;

      // Validate the code contains a default export
      if (!code.includes("export default")) {
        return "Error: Code must contain 'export default' — either a ToolDefinition object or a factory function.";
      }

      const skillDir = join(skillsDir, name);
      const handlerPath = join(skillDir, "handler.ts");

      if (existsSync(handlerPath)) {
        return `Error: Skill "${name}" already exists at ${handlerPath}. Delete it first or choose a different name.`;
      }

      mkdirSync(skillDir, { recursive: true });
      writeFileSync(handlerPath, code, "utf-8");

      return (
        `Skill "${name}" created at skills/${name}/handler.ts. ` +
        `Runbook: 1) call reload_skills, 2) confirm no failed skills, 3) confirm skills typecheck passes. ` +
        `Do not claim success until all three checks pass.`
      );
    },
  };
}
