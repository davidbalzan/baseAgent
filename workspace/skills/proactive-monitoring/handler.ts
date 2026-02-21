import { ToolDefinition } from "@baseagent/core";
import { SkillContext } from "@baseagent/skills";

const parameters = {
  type: "object",
  properties: {
    projectPath: {
      type: "string",
      description: "Project path to monitor.",
      default: "."
    },
    checkTests: { type: "boolean", default: true },
    checkGit: { type: "boolean", default: true },
    checkBuild: { type: "boolean", default: true }
  }
} as const;

export default function createTool(ctx: SkillContext): ToolDefinition<typeof parameters> {
  return {
    name: "proactive_monitoring",
    description: "Executes project health checks (git, tests, build) and returns a status report.",
    parameters,
    execute: async ({ projectPath, checkTests, checkGit, checkBuild }) => {
      const results: string[] = ["# Proactive Monitoring Report\n"];
      
      if (checkGit) {
        try {
          const { stdout } = await ctx.shell.exec("git status --porcelain", { cwd: projectPath });
          results.push("## Git Status");
          results.push(stdout.trim() ? `⚠ Uncommitted changes:\n${stdout}` : "✅ Working directory clean.");
        } catch (e) {
          results.push("## Git Status\n❌ Failed to run git status.");
        }
      }

      if (checkTests) {
        try {
          results.push("## Test Results");
          const { stdout, stderr } = await ctx.shell.exec("pnpm test", { cwd: projectPath });
          results.push("✅ Tests passed successfully.");
        } catch (e: any) {
          results.push(`❌ Tests failed:\n${e.stdout || e.message}`);
        }
      }

      if (checkBuild) {
        try {
          results.push("## Build Status");
          await ctx.shell.exec("pnpm build", { cwd: projectPath });
          results.push("✅ Build successful.");
        } catch (e: any) {
          results.push(`❌ Build failed:\n${e.stdout || e.message}`);
        }
      }

      return results.join("\n\n");
    }
  };
}
