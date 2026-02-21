import { z } from "zod";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ToolDefinition } from "@baseagent/core";

const parameters = z.object({
  mode: z
    .enum(["analyze", "apply"])
    .describe(
      "'analyze' returns structured suggestions. 'apply' returns the exact tool calls to execute.",
    ),
  focus: z
    .enum(["failures", "tokens", "tools", "all"])
    .optional()
    .default("all")
    .describe("Optional focus area for the analysis."),
});

interface SkillContext {
  workspacePath: string;
}

interface TraceInfo {
  filename: string;
  status: string;
  iterations: number;
  promptTokens: number;
  completionTokens: number;
  cost: number;
  input: string;
  toolCalls: string[];
  failedTools: string[];
  phases: string[];
}

function parseTrace(filepath: string): TraceInfo | null {
  try {
    const content = readFileSync(filepath, "utf-8");
    const lines = content.split("\n");

    let status = "unknown";
    let iterations = 0;
    let promptTokens = 0;
    let completionTokens = 0;
    let cost = 0;
    let input = "";
    const toolCalls: string[] = [];
    const failedTools: string[] = [];
    const phases: string[] = [];

    // Parse header table
    for (const line of lines) {
      const statusMatch = line.match(/\*\*Status\*\*\s*\|\s*(\w+)/);
      if (statusMatch) status = statusMatch[1];

      const iterMatch = line.match(/\*\*Iterations\*\*\s*\|\s*(\d+)/);
      if (iterMatch) iterations = parseInt(iterMatch[1], 10);

      const tokenMatch = line.match(/\*\*Tokens\*\*\s*\|\s*(\d+)\s*in\s*\/\s*(\d+)\s*out/);
      if (tokenMatch) {
        promptTokens = parseInt(tokenMatch[1], 10);
        completionTokens = parseInt(tokenMatch[2], 10);
      }

      const costMatch = line.match(/\*\*Cost\*\*\s*\|\s*\$([0-9.]+)/);
      if (costMatch) cost = parseFloat(costMatch[1]);
    }

    // Parse input block
    const inputStart = content.indexOf("## Input");
    if (inputStart !== -1) {
      const codeStart = content.indexOf("```\n", inputStart);
      const codeEnd = content.indexOf("\n```", codeStart + 4);
      if (codeStart !== -1 && codeEnd !== -1) {
        input = content.slice(codeStart + 4, codeEnd).trim();
      }
    }

    // Parse trace events for tool calls and failures
    const phaseMatches = content.matchAll(/### `(\w+)` — iter (\d+)/g);
    for (const match of phaseMatches) {
      phases.push(match[1]);
    }

    // Look for tool execution patterns
    const toolNameMatches = content.matchAll(/\*\*toolName\*\*:\s*(\w+)/g);
    for (const match of toolNameMatches) {
      toolCalls.push(match[1]);
    }

    // Look for error/failure patterns
    const errorMatches = content.matchAll(/\*\*error\*\*:\s*(.+)/g);
    for (const match of errorMatches) {
      failedTools.push(match[1]);
    }

    // Also detect failures from status="failed" traces
    if (status === "failed") {
      const outputMatch = content.match(/\*\*output\*\*:\s*(.+)/);
      if (outputMatch) failedTools.push(outputMatch[1]);
    }

    return {
      filename: filepath,
      status,
      iterations,
      promptTokens,
      completionTokens,
      cost,
      input,
      toolCalls,
      failedTools,
      phases,
    };
  } catch {
    return null;
  }
}

interface Suggestion {
  type: "context" | "tool_group" | "skill" | "mcp_server" | "general";
  confidence: "high" | "medium" | "low";
  summary: string;
  detail: string;
  toolCall?: {
    tool: string;
    args: Record<string, unknown>;
  };
}

function analyzeTraces(traces: TraceInfo[], focus: string): Suggestion[] {
  const suggestions: Suggestion[] = [];

  // --- Failure analysis ---
  if (focus === "all" || focus === "failures") {
    const failedSessions = traces.filter((t) => t.status === "failed");
    if (failedSessions.length > 0) {
      const failRate = ((failedSessions.length / traces.length) * 100).toFixed(1);
      suggestions.push({
        type: "general",
        confidence: failedSessions.length > 3 ? "high" : "medium",
        summary: `${failedSessions.length}/${traces.length} sessions failed (${failRate}%)`,
        detail: `Failed inputs: ${failedSessions.slice(0, 3).map((t) => `"${t.input.slice(0, 60)}"`).join(", ")}`,
      });
    }

    // Repeated error patterns
    const allErrors = traces.flatMap((t) => t.failedTools);
    const errorCounts = new Map<string, number>();
    for (const err of allErrors) {
      const key = err.slice(0, 80);
      errorCounts.set(key, (errorCounts.get(key) ?? 0) + 1);
    }
    for (const [error, count] of errorCounts) {
      if (count >= 2) {
        suggestions.push({
          type: "general",
          confidence: count >= 3 ? "high" : "medium",
          summary: `Recurring error (${count}x): ${error.slice(0, 60)}`,
          detail: `Error "${error}" appeared in ${count} sessions. Investigate root cause.`,
        });
      }
    }
  }

  // --- Token analysis ---
  if (focus === "all" || focus === "tokens") {
    const avgPromptTokens =
      traces.reduce((sum, t) => sum + t.promptTokens, 0) / (traces.length || 1);
    const avgCompletionTokens =
      traces.reduce((sum, t) => sum + t.completionTokens, 0) / (traces.length || 1);
    const totalCost = traces.reduce((sum, t) => sum + t.cost, 0);

    suggestions.push({
      type: "general",
      confidence: "low",
      summary: `Token usage: avg ${Math.round(avgPromptTokens)} in / ${Math.round(avgCompletionTokens)} out per session`,
      detail: `Total cost across ${traces.length} sessions: $${totalCost.toFixed(4)}`,
    });

    // High token sessions
    const highTokenSessions = traces.filter((t) => t.promptTokens > 20000);
    if (highTokenSessions.length > 2) {
      suggestions.push({
        type: "tool_group",
        confidence: "medium",
        summary: `${highTokenSessions.length} sessions used >20K prompt tokens — consider grouping tools`,
        detail: `High-token sessions may benefit from conditional tool groups to reduce prompt size.`,
      });
    }
  }

  // --- Tool usage analysis ---
  if (focus === "all" || focus === "tools") {
    const toolUsageCounts = new Map<string, number>();
    for (const trace of traces) {
      for (const tool of trace.toolCalls) {
        toolUsageCounts.set(tool, (toolUsageCounts.get(tool) ?? 0) + 1);
      }
    }

    // Find commonly used tools that could be grouped
    const sortedTools = [...toolUsageCounts.entries()].sort((a, b) => b[1] - a[1]);
    if (sortedTools.length > 0) {
      const topTools = sortedTools.slice(0, 5).map(([name, count]) => `${name}(${count})`);
      suggestions.push({
        type: "general",
        confidence: "low",
        summary: `Most used tools: ${topTools.join(", ")}`,
        detail: `Consider creating specialized skills for frequently repeated tool patterns.`,
      });
    }

    // Detect input patterns that could benefit from context
    const inputWords = new Map<string, number>();
    for (const trace of traces) {
      const words = trace.input.toLowerCase().split(/\s+/);
      for (const word of words) {
        if (word.length > 3) {
          inputWords.set(word, (inputWords.get(word) ?? 0) + 1);
        }
      }
    }

    // Find repeated topic patterns
    const commonTopics = [...inputWords.entries()]
      .filter(([, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    if (commonTopics.length > 0) {
      const topicList = commonTopics.map(([word, count]) => `"${word}"(${count})`).join(", ");
      suggestions.push({
        type: "context",
        confidence: "low",
        summary: `Frequent input topics: ${topicList}`,
        detail: `These topics appear repeatedly. Consider adding system context for common patterns.`,
      });
    }
  }

  return suggestions;
}

function suggestionsToApplyActions(suggestions: Suggestion[]): Suggestion[] {
  // Only return high-confidence suggestions with concrete tool calls
  return suggestions.filter((s) => s.confidence === "high" && s.toolCall);
}

export default function createTool(ctx: SkillContext): ToolDefinition<typeof parameters> {
  const tracesDir = resolve(ctx.workspacePath, "..", "traces");

  return {
    name: "self_improve",
    description:
      "Analyze recent session traces to identify patterns, failures, and optimization opportunities. " +
      "In 'analyze' mode, returns structured suggestions. In 'apply' mode, returns concrete tool calls " +
      "to execute (using add_system_context, register_tool_group, create_skill, or add_mcp_server). " +
      "Use 'focus' to narrow analysis to failures, token usage, or tool patterns.",
    parameters,
    permission: "read" as const,
    maxOutputChars: 80_000,
    execute: async (args) => {
      const { mode, focus } = args;

      if (!existsSync(tracesDir)) {
        return "No traces directory found. Run some sessions first to generate trace data.";
      }

      // Read recent trace files (last 20, sorted by modification time)
      const traceFiles = readdirSync(tracesDir)
        .filter((f) => f.endsWith(".md"))
        .map((f) => ({
          name: f,
          path: join(tracesDir, f),
          mtime: statSync(join(tracesDir, f)).mtimeMs,
        }))
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, 20);

      if (traceFiles.length === 0) {
        return "No trace files found in traces/. Run some sessions first.";
      }

      // Parse all traces
      const traces: TraceInfo[] = [];
      for (const file of traceFiles) {
        const trace = parseTrace(file.path);
        if (trace) traces.push(trace);
      }

      if (traces.length === 0) {
        return "Could not parse any trace files. They may be in an unexpected format.";
      }

      // Run analysis
      const suggestions = analyzeTraces(traces, focus ?? "all");

      if (mode === "analyze") {
        const lines = [
          `# Self-Improvement Analysis`,
          ``,
          `Analyzed ${traces.length} recent sessions (focus: ${focus ?? "all"})`,
          ``,
          `## Summary`,
          `- Sessions: ${traces.length} (${traces.filter((t) => t.status === "completed").length} completed, ${traces.filter((t) => t.status === "failed").length} failed)`,
          `- Avg prompt tokens: ${Math.round(traces.reduce((s, t) => s + t.promptTokens, 0) / traces.length)}`,
          `- Avg iterations: ${(traces.reduce((s, t) => s + t.iterations, 0) / traces.length).toFixed(1)}`,
          `- Total cost: $${traces.reduce((s, t) => s + t.cost, 0).toFixed(4)}`,
          ``,
          `## Suggestions (${suggestions.length})`,
          ``,
        ];

        for (const s of suggestions) {
          lines.push(`### [${s.confidence.toUpperCase()}] ${s.summary}`);
          lines.push(`Type: ${s.type}`);
          lines.push(s.detail);
          if (s.toolCall) {
            lines.push(`\nAction: call \`${s.toolCall.tool}\` with args: ${JSON.stringify(s.toolCall.args)}`);
          }
          lines.push("");
        }

        if (suggestions.length === 0) {
          lines.push("No actionable suggestions found. Sessions look healthy.");
        }

        return lines.join("\n");
      }

      // Apply mode — return only high-confidence actions
      const actions = suggestionsToApplyActions(suggestions);

      if (actions.length === 0) {
        // Still return the analysis with a note
        const analysisSummary = suggestions
          .map((s) => `- [${s.confidence}] ${s.summary}`)
          .join("\n");

        return (
          `# Self-Improvement — Apply Mode\n\n` +
          `No high-confidence suggestions with concrete actions found.\n\n` +
          `## Lower-confidence suggestions to review:\n${analysisSummary}\n\n` +
          `Consider running with mode="analyze" for full details, then manually invoke:\n` +
          `- \`add_system_context\` — to add context to the system prompt\n` +
          `- \`register_tool_group\` — to optimize token usage with conditional groups\n` +
          `- \`create_skill\` — to create reusable skills for repeated patterns\n` +
          `- \`add_mcp_server\` — to install new tool servers`
        );
      }

      const lines = [
        `# Self-Improvement — Apply Mode`,
        ``,
        `Found ${actions.length} high-confidence actions to execute:`,
        ``,
      ];

      for (const action of actions) {
        lines.push(`## ${action.summary}`);
        lines.push(`Tool: \`${action.toolCall!.tool}\``);
        lines.push(`Args: \`${JSON.stringify(action.toolCall!.args)}\``);
        lines.push(action.detail);
        lines.push("");
      }

      lines.push("Execute the above tool calls to apply these improvements.");
      return lines.join("\n");
    },
  };
}
