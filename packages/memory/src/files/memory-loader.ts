import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export interface MemoryFile {
  name: string;
  filename: string;
  priority: number;
  /** If true, loaded from userDir when provided; otherwise from workspacePath. */
  perUser: boolean;
  /** Human-readable description (used in dashboard UI). */
  description: string;
}

export const MEMORY_FILES: MemoryFile[] = [
  { name: "Soul", filename: "SOUL.md", priority: 1, perUser: false, description: "Core identity, name, values" },
  { name: "Context", filename: "CONTEXT.md", priority: 2, perUser: false, description: "Situational context and environment" },
  { name: "Personality", filename: "PERSONALITY.md", priority: 3, perUser: false, description: "Tone, style, communication patterns" },
  { name: "User", filename: "USER.md", priority: 4, perUser: true, description: "User preferences, context" },
  { name: "Memory", filename: "MEMORY.md", priority: 5, perUser: true, description: "Agent's long-term memories" },
  { name: "Heartbeat", filename: "HEARTBEAT.md", priority: 6, perUser: false, description: "Scheduled task definitions" },
];

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function parseBotName(workspacePath: string): string {
  const filePath = resolve(workspacePath, "SOUL.md");
  if (!existsSync(filePath)) return "baseAgent";

  try {
    const content = readFileSync(filePath, "utf-8");
    const match = content.match(/\*\*Name\*\*:\s*(.+)/);
    return match ? match[1].trim() : "baseAgent";
  } catch {
    return "baseAgent";
  }
}

export interface LoadMemoryOptions {
  /** Use SOUL_COMPACT.md instead of SOUL.md (for cheaper/smaller models). */
  compact?: boolean;
}

/**
 * Load memory files into a combined string for the system prompt.
 *
 * Shared files (SOUL.md, PERSONALITY.md, HEARTBEAT.md) are loaded from workspacePath.
 * Per-user files (USER.md, MEMORY.md) are loaded from userDir when provided,
 * falling back to workspacePath for backward compatibility.
 *
 * When `compact` is true, SOUL_COMPACT.md is used instead of SOUL.md
 * to reduce token usage for cheaper models.
 */
export function loadMemoryFiles(
  workspacePath: string,
  maxTokenBudget: number,
  userDir?: string,
  options?: LoadMemoryOptions,
): string {
  const sections: string[] = [];
  let tokenCount = 0;

  // Build the file list, swapping soul file when compact mode is on
  const files = options?.compact
    ? MEMORY_FILES.map((f) =>
        f.filename === "SOUL.md"
          ? { ...f, filename: "SOUL_COMPACT.md", name: "Soul (compact)" }
          : f,
      )
    : MEMORY_FILES;

  for (const file of files) {
    let filePath: string;
    if (file.perUser && userDir) {
      // Try per-user dir first, fall back to workspace root
      const userPath = resolve(userDir, file.filename);
      filePath = existsSync(userPath) ? userPath : resolve(workspacePath, file.filename);
    } else {
      filePath = resolve(workspacePath, file.filename);
    }

    if (!existsSync(filePath)) continue;

    let content: string;
    try {
      content = readFileSync(filePath, "utf-8").trim();
    } catch {
      continue;
    }

    if (!content) continue;

    const tokens = estimateTokens(content);
    if (tokenCount + tokens > maxTokenBudget) {
      // Truncate to fit remaining budget
      const remainingTokens = maxTokenBudget - tokenCount;
      if (remainingTokens <= 0) break;
      const charLimit = remainingTokens * 4;
      content = content.slice(0, charLimit) + "\n\n[...truncated to fit token budget]";
    }

    sections.push(`--- ${file.name} (${file.filename}) ---\n${content}`);
    tokenCount += estimateTokens(content);

    if (tokenCount >= maxTokenBudget) break;
  }

  if (sections.length === 0) {
    return "You are a helpful AI assistant.";
  }

  return sections.join("\n\n");
}
