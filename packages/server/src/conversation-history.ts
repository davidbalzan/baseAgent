import type { CoreMessage } from "@baseagent/core";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatSessionDate(iso: string): string {
  const d = new Date(iso);
  const month = MONTHS[d.getUTCMonth()];
  const day = d.getUTCDate();
  const hours = String(d.getUTCHours()).padStart(2, "0");
  const mins = String(d.getUTCMinutes()).padStart(2, "0");
  return `${month} ${day}, ${hours}:${mins}`;
}

export const BOUNDARY_MARKER = "\n\n--- End of conversation history. Only respond to the current message below. ---";
/** @deprecated Kept for test compatibility — no longer injected as a separate message. */
export const BOUNDARY_ACK = "";
/** Approximate token overhead for the boundary suffix. */
const BOUNDARY_TOKENS = Math.ceil(BOUNDARY_MARKER.length / 4);
/** Approximate per-turn overhead for the "[Previous conversation — ...]" header + "User: " prefix. */
const HEADER_OVERHEAD_CHARS = 50;

export function buildConversationHistory(
  sessions: Array<{ input: string; output: string | null; createdAt: string }>,
  tokenBudget: number,
): CoreMessage[] | undefined {
  const selected: Array<{ input: string; output: string; createdAt: string }> = [];
  // Reserve space for the boundary marker pair
  let tokensUsed = BOUNDARY_TOKENS;

  for (const s of sessions) {
    if (!s.output) continue;
    const turnTokens = Math.ceil((s.input.length + s.output.length + HEADER_OVERHEAD_CHARS) / 4);
    if (tokensUsed + turnTokens > tokenBudget) break;
    selected.push({ input: s.input, output: s.output, createdAt: s.createdAt });
    tokensUsed += turnTokens;
  }

  if (selected.length === 0) return undefined;

  // Build messages in chronological order (selected is newest-first from DB)
  const chronological = selected.reverse();
  const messages: CoreMessage[] = [];

  for (const s of chronological) {
    const header = `[Previous conversation — ${formatSessionDate(s.createdAt)}]`;
    messages.push({ role: "user", content: `${header}\nUser: ${s.input}` });
    messages.push({ role: "assistant", content: s.output });
  }

  // Append boundary to the last assistant message so the model knows
  // history ends here — avoids creating a fake user+assistant turn that
  // the model responds to literally.
  const lastMsg = messages[messages.length - 1];
  if (lastMsg && lastMsg.role === "assistant" && typeof lastMsg.content === "string") {
    lastMsg.content += BOUNDARY_MARKER;
  }

  return messages;
}
