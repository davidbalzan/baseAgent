import { z } from "zod";
import type { ToolDefinition } from "@baseagent/core";

const parameters = z.object({
  projectPath: z.string().optional().default(".").describe("Project path to monitor."),
  checkTests: z.boolean().optional().default(true),
  checkGit: z.boolean().optional().default(true),
  checkDependencies: z.boolean().optional().default(true),
  checkBuild: z.boolean().optional().default(true),
});

interface SkillContext {
  workspacePath: string;
}

export default function createTool(_ctx: SkillContext): ToolDefinition<typeof parameters> {
  return {
    name: "proactive_monitoring",
    description:
      "Generate a heartbeat/scheduler monitoring checklist (tests, build, git, dependencies). Advisory output only; does not mutate code or files.",
    parameters,
    execute: async (args) => {
      const checks: string[] = [];
      if (args.checkGit) checks.push("- git status --porcelain");
      if (args.checkTests) checks.push("- pnpm test");
      if (args.checkBuild) checks.push("- pnpm build");
      if (args.checkDependencies) checks.push("- pnpm outdated");

      return [
        "# Proactive Monitoring Plan",
        "",
        `Project: ${args.projectPath}`,
        "",
        "Recommended checks:",
        ...checks,
        "",
        "Run these checks in heartbeat or scheduler automation, then summarize only actionable findings.",
      ].join("\n");
    },
  };
}
