import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { generateText, type LanguageModel, type CoreMessage } from "ai";

const SUMMARIZATION_SYSTEM = `Summarize the following conversation. Preserve: key facts, decisions made, tool results, and the user's current intent. Be concise.`;

export async function compactMessages(
  model: LanguageModel,
  messages: CoreMessage[],
  systemPrompt: string,
): Promise<{ summary: string; compactedMessages: CoreMessage[] }> {
  // System message stays unchanged
  const systemMessage = messages[0];
  const history = messages.slice(1);

  // Build a text representation of the conversation history for summarization
  const historyText = history
    .map((m) => {
      const content =
        typeof m.content === "string"
          ? m.content
          : JSON.stringify(m.content);
      return `[${m.role}]: ${content}`;
    })
    .join("\n\n");

  const { text: summary } = await generateText({
    model,
    system: SUMMARIZATION_SYSTEM,
    messages: [{ role: "user", content: historyText }],
  });

  const compactedMessages: CoreMessage[] = [
    systemMessage,
    {
      role: "user",
      content: `${summary}\n\nContinue from where we left off.`,
    },
  ];

  return { summary, compactedMessages };
}

export function persistCompactionSummary(
  workspacePath: string,
  summary: string,
): void {
  const memoryPath = resolve(workspacePath, "MEMORY.md");
  mkdirSync(dirname(memoryPath), { recursive: true });

  const timestamp = new Date().toISOString();
  const section = `\n\n## Compaction Summary — ${timestamp}\n\n${summary}\n`;

  appendFileSync(memoryPath, section, "utf-8");
}
