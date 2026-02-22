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
    checkBuild: { type: "boolean", default: true },
    checkDependencies: { type: "boolean", default: true }
  }
} as const;

export default function createTool(ctx: SkillContext): ToolDefinition<typeof parameters> {
  return {
    name: "project_health_check",
    description: "Executes real-time project health checks (git, tests, build, deps) and returns a status report.",
    parameters,
    execute: async ({ projectPath, checkTests, checkGit, checkBuild, checkDependencies }) => {
      const results: string[] = ["# Proactive Monitoring Report\n"];
      const scope = projectPath === "." ? "project" : "workspace";
      
      if (checkGit) {
        try {
          const { stdout } = await ctx.shell.exec("git status --porcelain", { scope });
          results.push("## Git Status");
          results.push(stdout.trim() ? `⚠ Uncommitted changes:\n${stdout}` : "✅ Working directory clean.");
        } catch (e) {
          results.push("## Git Status\n❌ Failed to run git status.");
        }
      }

      if (checkTests) {
        try {
          results.push("## Test Results");
          await ctx.shell.exec("pnpm test", { scope });
          results.push("✅ Tests passed successfully.");
        } catch (e: any) {
          results.push(`❌ Tests failed:\n${e.stdout || e.message}`);
        }
      }

      if (checkBuild) {
        try {
          results.push("## Build Status");
          await ctx.shell.exec("pnpm build", { scope });
          results.push("✅ Build successful.");
        } catch (e: any) {
          results.push(`❌ Build failed:\n${e.stdout || e.message}`);
        }
      }

      if (checkDependencies) {
        try {
          results.push("## Dependency Audit");
          const { stdout } = await ctx.shell.exec("pnpm audit --audit-level high", { scope });
          results.push("✅ No high-severity vulnerabilities found.");
        } catch (e: any) {
          results.push(`⚠ Audit found issues:\n${e.stdout || e.message}`);
        }
      }

      return results.join("\n\n");
    }
  };
}
