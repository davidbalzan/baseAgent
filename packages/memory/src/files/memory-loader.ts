import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

interface MemoryFile {
  name: string;
  filename: string;
  priority: number;
}

const MEMORY_FILES: MemoryFile[] = [
  { name: "Soul", filename: "SOUL.md", priority: 1 },
  { name: "User", filename: "USER.md", priority: 2 },
  { name: "Memory", filename: "MEMORY.md", priority: 3 },
  { name: "Heartbeat", filename: "HEARTBEAT.md", priority: 4 },
];

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function loadMemoryFiles(
  workspacePath: string,
  maxTokenBudget: number,
): string {
  const sections: string[] = [];
  let tokenCount = 0;

  for (const file of MEMORY_FILES) {
    const filePath = resolve(workspacePath, file.filename);

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
