import { z } from "zod";
import type { ToolDefinition } from "@baseagent/core";

const parameters = z.object({
  action: z.enum(["analyze", "suggest", "learn", "track"]).describe("Action to perform."),
  context: z.string().optional().default("").describe("Optional context string."),
});

function buildSuggestions(context: string): string[] {
  const normalized = context.toLowerCase();
  const suggestions: string[] = [];

  if (normalized.includes("test")) {
    suggestions.push("Run `pnpm test` before committing.");
  }
  if (normalized.includes("build")) {
    suggestions.push("Run `pnpm build` to verify the workspace compiles.");
  }
  if (normalized.includes("git")) {
    suggestions.push("Run `git status` and `git diff` before finalizing changes.");
  }

  suggestions.push("Review `workspace/MEMORY.md` for recent compaction learnings.");
  suggestions.push("Review `workspace/HEARTBEAT.md` for proactive automation opportunities.");

  return suggestions;
}

const tool: ToolDefinition<typeof parameters> = {
  name: "context_suggestions",
  description:
    "Generate lightweight context-aware engineering suggestions from the provided text only. No trace analysis and no file/tool side effects.",
  parameters,
  execute: async (args) => {
    const context = args.context.trim();

    if (args.action === "analyze") {
      return [
        "# Context Suggestions — Analyze",
        "",
        "Detected signals:",
        `- has test context: ${String(context.toLowerCase().includes("test"))}`,
        `- has build context: ${String(context.toLowerCase().includes("build"))}`,
        `- has git context: ${String(context.toLowerCase().includes("git"))}`,
      ].join("\n");
    }

    if (args.action === "suggest") {
      const suggestions = buildSuggestions(context);
      return [
        "# Context Suggestions — Recommend",
        "",
        ...suggestions.map((s) => `- ${s}`),
      ].join("\n");
    }

    if (args.action === "learn") {
      return [
        "# Context Suggestions — Learn",
        "",
        "No direct file mutation is performed by this helper.",
        "Use `add_system_context` for durable facts and `memory_write` for user/project notes.",
      ].join("\n");
    }

    return [
      "# Context Suggestions — Track",
      "",
      "Tracking template:",
      `- Context snippet: ${context || "(empty)"}`,
      "- Next step: convert repeated patterns into tool groups via `register_tool_group`.",
    ].join("\n");
  },
};

export default tool;
