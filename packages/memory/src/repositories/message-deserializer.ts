import type { ToolMessageMeta } from "@baseagent/core";
import type { SerializedMessage } from "./message.repository.js";

export interface RestoredMessage {
  role: string;
  content: string | unknown;
}

export interface DeserializedSession {
  messages: RestoredMessage[];
  toolMessageMeta: ToolMessageMeta[];
}

export function deserializeMessages(rows: SerializedMessage[]): DeserializedSession {
  const messages: RestoredMessage[] = [];
  const toolMessageMeta: ToolMessageMeta[] = [];

  for (const row of rows) {
    const content = parseContent(row.content);

    messages.push({ role: row.role, content });

    if (row.role === "tool") {
      toolMessageMeta.push({
        messageIndex: messages.length - 1,
        iteration: row.iteration,
      });
    }
  }

  return { messages, toolMessageMeta };
}

function parseContent(raw: string): string | unknown {
  const trimmed = raw.trimStart();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}
