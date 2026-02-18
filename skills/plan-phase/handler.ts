import { z } from "zod";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { ToolDefinition } from "@baseagent/core";

const parameters = z.object({
  phase: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Phase number to inspect. Omit to list all phases."),
});

interface SkillContext {
  workspacePath: string;
}

export default function createTool(ctx: SkillContext): ToolDefinition<typeof parameters> {
  // phases live at <repo-root>/docs/phases/ — workspace is <repo-root>/workspace
  const phasesDir = join(ctx.workspacePath, "..", "docs", "phases");

  return {
    name: "plan_phase",
    description:
      "Read project phase plans. Without a phase number, lists all available phases. With a phase number, returns the task breakdown with completion status.",
    parameters,
    timeoutMs: 5_000,
    maxOutputChars: 30_000,
    execute: async (args) => {
      if (!existsSync(phasesDir)) {
        return "No phases directory found. Run /plan-phase to create phase plans.";
      }

      const entries = readdirSync(phasesDir).filter(
        (e) => e.startsWith("phase") && !e.startsWith(".")
      );

      if (entries.length === 0) {
        return "No phase directories found. Only templates exist. Run /plan-phase to create phase plans.";
      }

      // List mode
      if (args.phase === undefined) {
        const summaries: string[] = [];
        for (const dir of entries.sort()) {
          const readmePath = join(phasesDir, dir, "README.md");
          if (existsSync(readmePath)) {
            const content = readFileSync(readmePath, "utf-8");
            const firstLine = content.split("\n").find((l) => l.startsWith("# "));
            summaries.push(`- ${dir}: ${firstLine?.replace("# ", "") ?? "(no title)"}`);
          } else {
            summaries.push(`- ${dir}: (no README.md)`);
          }
        }
        return `Available phases:\n${summaries.join("\n")}`;
      }

      // Detail mode
      const phaseDir = entries.find(
        (e) => e === `phase${args.phase}` || e === `phase-${args.phase}`
      );
      if (!phaseDir) {
        return `Phase ${args.phase} not found. Available: ${entries.join(", ")}`;
      }

      const dir = join(phasesDir, phaseDir);
      const files = readdirSync(dir);

      // Find task file (PHASE1_TASKS.md, TASKS.md, etc.)
      const taskFile = files.find(
        (f) => f.toUpperCase().includes("TASK") && f.endsWith(".md")
      );

      if (taskFile) {
        const content = readFileSync(join(dir, taskFile), "utf-8");
        const total = (content.match(/- \[[ x]\]/g) ?? []).length;
        const done = (content.match(/- \[x\]/g) ?? []).length;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;

        return `Phase ${args.phase} — ${done}/${total} tasks complete (${pct}%)\n\n${content}`;
      }

      // Fallback to README
      const readmePath = join(dir, "README.md");
      if (existsSync(readmePath)) {
        return readFileSync(readmePath, "utf-8");
      }

      return `Phase ${args.phase} directory exists but contains no task or README files.`;
    },
  };
}
