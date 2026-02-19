import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

interface MemoryFile {
  name: string;
  filename: string;
  priority: number;
  /** If true, loaded from userDir when provided; otherwise from workspacePath. */
  perUser: boolean;
}

const MEMORY_FILES: MemoryFile[] = [
  { name: "Soul", filename: "SOUL.md", priority: 1, perUser: false },
  { name: "Personality", filename: "PERSONALITY.md", priority: 2, perUser: false },
  { name: "User", filename: "USER.md", priority: 3, perUser: true },
  { name: "Memory", filename: "MEMORY.md", priority: 4, perUser: true },
  { name: "Heartbeat", filename: "HEARTBEAT.md", priority: 5, perUser: false },
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

/**
 * Load memory files into a combined string for the system prompt.
 *
 * Shared files (SOUL.md, PERSONALITY.md, HEARTBEAT.md) are loaded from workspacePath.
 * Per-user files (USER.md, MEMORY.md) are loaded from userDir when provided,
 * falling back to workspacePath for backward compatibility.
 */
export function loadMemoryFiles(
  workspacePath: string,
  maxTokenBudget: number,
  userDir?: string,
): string {
  const sections: string[] = [];
  let tokenCount = 0;

  for (const file of MEMORY_FILES) {
    const baseDir = (file.perUser && userDir) ? userDir : workspacePath;
    const filePath = resolve(baseDir, file.filename);

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
