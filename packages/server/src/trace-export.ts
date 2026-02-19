import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import type { TraceRepository } from "@baseagent/memory";
import type { LoopState } from "@baseagent/core";

function formatData(data: Record<string, unknown> | undefined | null): string {
  if (!data) return "";
  const lines: string[] = [];

  for (const [key, val] of Object.entries(data)) {
    if (val === undefined || val === null) continue;
    const text = typeof val === "string" ? val : JSON.stringify(val, null, 2);
    lines.push(`**${key}:** ${text}`);
  }
  return lines.join("\n");
}

/**
 * Writes a human-readable Markdown replay of a completed session to
 * `<rootDir>/traces/YYYY-MM-DD-<sessionId>.md`.
 *
 * Non-fatal: errors are logged but never propagate to the caller.
 */
export function exportSessionTrace(
  rootDir: string,
  sessionId: string,
  input: string,
  state: LoopState,
  traceRepo: TraceRepository,
): void {
  try {
    const events = traceRepo.findBySession(sessionId);
    if (events.length === 0) return;

    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const shortId = sessionId.slice(0, 8);

    const lines: string[] = [
      `# Session Trace — ${date}`,
      "",
      `| Field | Value |`,
      `|-------|-------|`,
      `| **Session** | \`${sessionId}\` |`,
      `| **Status** | ${state.status} |`,
      `| **Iterations** | ${state.iteration} |`,
      `| **Tokens** | ${state.promptTokens} in / ${state.completionTokens} out |`,
      `| **Cost** | $${state.estimatedCostUsd.toFixed(6)} |`,
      "",
      `## Input`,
      "",
      "```",
      input,
      "```",
      "",
      "---",
      "",
      "## Trace Events",
      "",
    ];

    for (const event of events) {
      const data = event.data ? JSON.parse(event.data as string) as Record<string, unknown> : null;
      lines.push(`### \`${event.phase}\` — iter ${event.iteration}`);
      lines.push("");

      if (event.promptTokens || event.completionTokens) {
        lines.push(`*${event.promptTokens ?? 0} in / ${event.completionTokens ?? 0} out tokens*`);
        lines.push("");
      }

      if (data) {
        const body = formatData(data);
        if (body) {
          lines.push(body);
          lines.push("");
        }
      }

      lines.push(`*${event.timestamp}*`);
      lines.push("");
      lines.push("---");
      lines.push("");
    }

    const outPath = resolve(rootDir, "traces", `${date}-${shortId}.md`);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, lines.join("\n"), "utf-8");
  } catch (err) {
    console.warn(`[trace-export] Failed to write trace for ${sessionId}:`, err);
  }
}
