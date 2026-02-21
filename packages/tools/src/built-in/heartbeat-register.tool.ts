import { z } from "zod";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ToolDefinition } from "@baseagent/core";

const parameters = z.object({
  task: z
    .string()
    .min(3)
    .describe("Natural-language heartbeat task, e.g. 'Every heartbeat tick: Run proactive monitoring for project health'"),
});

function normalizeTask(task: string): string {
  const trimmed = task.trim().replace(/\s+/g, " ");
  return trimmed.startsWith("- [ ]") ? trimmed : `- [ ] ${trimmed}`;
}

function insertUnderSchedule(content: string, line: string): { updated: string; changed: boolean } {
  if (content.includes(line)) return { updated: content, changed: false };

  const lines = content.split("\n");
  const scheduleIndex = lines.findIndex((l) => /^##\s+Schedule\s*$/i.test(l.trim()));

  if (scheduleIndex === -1) {
    const sep = content.endsWith("\n") ? "" : "\n";
    return {
      updated: `${content}${sep}\n## Schedule\n\n${line}\n`,
      changed: true,
    };
  }

  let insertIndex = scheduleIndex + 1;
  while (insertIndex < lines.length) {
    const current = lines[insertIndex].trim();
    if (current.startsWith("## ")) break;
    insertIndex += 1;
  }

  lines.splice(insertIndex, 0, line);
  return { updated: lines.join("\n"), changed: true };
}

export function createHeartbeatRegisterTool(workspacePath: string): ToolDefinition<typeof parameters> {
  return {
    name: "heartbeat_register",
    description:
      "Safely register a new checklist item in HEARTBEAT.md under the Schedule section. " +
      "Use this instead of file_edit/file_write for heartbeat automation updates.",
    parameters,
    permission: "write",
    execute: async (args) => {
      const heartbeatPath = resolve(workspacePath, "HEARTBEAT.md");
      const taskLine = normalizeTask(args.task);

      const current = existsSync(heartbeatPath)
        ? readFileSync(heartbeatPath, "utf-8")
        : "# Heartbeat\n\n## Schedule\n";

      const { updated, changed } = insertUnderSchedule(current, taskLine);
      if (!changed) {
        return `HEARTBEAT.md already contains: ${taskLine}`;
      }

      writeFileSync(heartbeatPath, updated, "utf-8");
      return `Registered heartbeat task: ${taskLine}`;
    },
  };
}
