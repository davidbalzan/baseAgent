import type {
  LanguageModelV1,
  LanguageModelV1StreamPart,
} from "ai";
import type { FallbackReason } from "@baseagent/core";

// ─── Public types ────────────────────────────────────────────────

interface OpenCodeModelRef {
  providerID: string;
  modelID: string;
}

export interface OpenCodeBridgeOptions {
  model: string;
  fallbackModels?: string[];
  baseUrl?: string;
  providerId?: string;
  directory?: string;
  timeoutMs?: number;
  modelCooldownMs?: number;
  modelCooldownReasons?: FallbackReason[];
}

// ─── OpenCode SSE event types (subset of SDK types we care about) ────

interface OcTextPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "text";
  text: string;
}

interface OcReasoningPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "reasoning";
  text: string;
}

interface OcToolStateCompleted {
  status: "completed";
  input: Record<string, unknown>;
  output: string;
  title: string;
  metadata: Record<string, unknown>;
  time: { start: number; end: number };
}

interface OcToolStateError {
  status: "error";
  input: Record<string, unknown>;
  error: string;
  time: { start: number; end: number };
}

interface OcToolStateRunning {
  status: "running";
  input: Record<string, unknown>;
  title?: string;
  time: { start: number };
}

interface OcToolStatePending {
  status: "pending";
  input: Record<string, unknown>;
  raw: string;
}

type OcToolState = OcToolStatePending | OcToolStateRunning | OcToolStateCompleted | OcToolStateError;

interface OcToolPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "tool";
  callID: string;
  tool: string;
  state: OcToolState;
}

interface OcStepFinishPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "step-finish";
  reason: string;
  cost: number;
  tokens: {
    input: number;
    output: number;
    reasoning: number;
    cache: { read: number; write: number };
  };
}

type OcPart = OcTextPart | OcReasoningPart | OcToolPart | OcStepFinishPart | { type: string; [key: string]: unknown };

interface OcEventMessagePartUpdated {
  type: "message.part.updated";
  properties: {
    part: OcPart;
    delta?: string;
  };
}

interface OcEventSessionStatus {
  type: "session.status";
  properties: {
    sessionID: string;
    status: { type: "idle" } | { type: "busy" } | { type: "retry"; attempt: number; message: string; next: number };
  };
}

interface OcEventSessionIdle {
  type: "session.idle";
  properties: { sessionID: string };
}

interface OcEventSessionError {
  type: "session.error";
  properties: {
    sessionID?: string;
    error?: { name: string; data?: { message?: string } };
  };
}

interface OcEventMessageUpdated {
  type: "message.updated";
  properties: {
    info: {
      id: string;
      sessionID: string;
      role: "assistant" | "user";
      tokens?: { input: number; output: number; reasoning: number };
      cost?: number;
      finish?: string;
      error?: unknown;
    };
  };
}

type OcEvent =
  | OcEventMessagePartUpdated
  | OcEventSessionStatus
  | OcEventSessionIdle
  | OcEventSessionError
  | OcEventMessageUpdated
  | { type: string; properties: unknown };

// ─── Helpers ────────────────────────────────────────────────────

function classifyBridgeError(error: unknown): FallbackReason {
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (msg.includes("http 429") || msg.includes("rate limit") || msg.includes("too many requests")) return "rate-limit";
  if (msg.includes("quota") || msg.includes("usage limit") || msg.includes("time window") || msg.includes("monthly limit")) return "quota-window";
  if (msg.includes("http 401") || msg.includes("http 403") || msg.includes("unauthorized") || msg.includes("forbidden")) return "auth";
  if (msg.includes("timeout") || msg.includes("fetch failed") || msg.includes("network") || msg.includes("econn")) return "network";
  return "unknown";
}

export function parseOpenCodeModelRef(model: string, defaultProviderID: string): OpenCodeModelRef {
  if (model.includes("/")) {
    const [providerID, ...rest] = model.split("/");
    const modelID = rest.join("/").trim();
    if (providerID.trim() && modelID) {
      return { providerID: providerID.trim(), modelID };
    }
  }
  return { providerID: defaultProviderID, modelID: model };
}

/**
 * Extract text from a message content field (string or parts array).
 */
function extractMsgText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const partType = (part as { type?: unknown }).type;
      if (partType === "text") {
        const maybeText = (part as { text?: unknown; textDelta?: unknown }).text
          ?? (part as { textDelta?: unknown }).textDelta;
        return typeof maybeText === "string" ? maybeText : "";
      }
      if (partType === "tool-call") {
        const toolName = (part as { toolName?: unknown }).toolName;
        return typeof toolName === "string" ? `[tool-call:${toolName}]` : "[tool-call]";
      }
      if (partType === "tool-result") {
        const toolName = (part as { toolName?: unknown }).toolName;
        return typeof toolName === "string" ? `[tool-result:${toolName}]` : "[tool-result]";
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * Split an AI-SDK prompt array into { system, user } for the OpenCode bridge.
 *
 * We intentionally DO NOT forward upstream system prompts to OpenCode's
 * `system` parameter because that can trigger recursive "agent-on-agent"
 * behaviour (tool manifests echoed, prompt leakage, synthetic tool logs).
 */
export function splitPrompt(prompt: unknown): { system: string; user: string } {
  if (!Array.isArray(prompt)) return { system: "", user: "" };

  const turns: Array<{ role: string; text: string }> = [];

  for (const msg of prompt) {
    if (!msg || typeof msg !== "object") continue;
    const role = typeof (msg as { role?: unknown }).role === "string"
      ? String((msg as { role?: string }).role)
      : "user";
    const text = extractMsgText((msg as { content?: unknown }).content);
    if (!text) continue;

    if (role !== "system") {
      turns.push({ role, text });
    }
  }

  const system = "";

  // User text: conversation history + current message
  const chunks: string[] = [];

  // Find the last user message (the current query)
  let lastUserIdx = -1;
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].role === "user") { lastUserIdx = i; break; }
  }

  // Conversation history — keep a short tail for coherence
  if (lastUserIdx > 0) {
    const historyWindow = turns.slice(Math.max(0, lastUserIdx - 6), lastUserIdx);
    for (const turn of historyWindow) {
      const label = turn.role === "assistant" ? "Assistant" : "User";
      chunks.push(`${label}: ${turn.text}`);
    }
  }

  // Current user message — no prefix
  if (lastUserIdx >= 0) {
    chunks.push("Respond to the current user message only. Do not repeat prompts or tool manifests.");
    chunks.push(`Current user message:\n${turns[lastUserIdx].text}`);
  }

  const user = chunks.join("\n\n").trim();
  return { system, user };
}

/** @deprecated Use splitPrompt instead. Kept for backward compat with tests. */
export function promptToText(prompt: unknown): string {
  const { system, user } = splitPrompt(prompt);
  return [system, user].filter(Boolean).join("\n\n");
}

// ─── SSE parser ──────────────────────────────────────────────────

/**
 * Parse an SSE stream into typed events.
 * Handles multi-line `data:` fields and reconnects on parse errors.
 */
async function* parseSseStream(
  response: Response,
  sessionId: string,
): AsyncGenerator<OcEvent> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      let eventType = "";
      let dataLines: string[] = [];

      for (const line of lines) {
        if (line.startsWith("event:")) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5));
        } else if (line === "") {
          // End of event
          if (dataLines.length > 0) {
            const raw = dataLines.join("\n").trim();
            dataLines = [];
            if (!raw) { eventType = ""; continue; }
            try {
              const parsed = JSON.parse(raw) as OcEvent;
              // Only yield events for our session (or session-less events)
              const sid = getEventSessionId(parsed);
              if (!sid || sid === sessionId) {
                yield parsed;
              }
            } catch {
              // Skip malformed events
            }
          }
          eventType = "";
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function getEventSessionId(event: OcEvent): string | undefined {
  if (!event.properties || typeof event.properties !== "object") return undefined;
  const props = event.properties as Record<string, unknown>;
  if (typeof props.sessionID === "string") return props.sessionID;
  if (props.part && typeof props.part === "object" && typeof (props.part as Record<string, unknown>).sessionID === "string") {
    return (props.part as Record<string, unknown>).sessionID as string;
  }
  if (props.info && typeof props.info === "object" && typeof (props.info as Record<string, unknown>).sessionID === "string") {
    return (props.info as Record<string, unknown>).sessionID as string;
  }
  return undefined;
}

// ─── HTTP helpers ────────────────────────────────────────────────

async function jsonFetch<T>(url: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`OpenCode request timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`OpenCode HTTP ${response.status}: ${text || response.statusText}`);
  }
  return text ? JSON.parse(text) as T : (undefined as T);
}

// ─── Bridge model ────────────────────────────────────────────────

export function createOpenCodeBridgeModel(options: OpenCodeBridgeOptions): LanguageModelV1 {
  const baseUrl = (options.baseUrl ?? "http://127.0.0.1:4096").replace(/\/+$/, "");
  const defaultProvider = options.providerId ?? "openai";
  const timeoutMs = options.timeoutMs ?? 60_000;
  const modelCooldownMs = options.modelCooldownMs ?? 30 * 60 * 1000;
  const modelCooldownReasons = new Set<FallbackReason>(options.modelCooldownReasons ?? ["quota-window", "rate-limit"]);
  const modelRefs = [options.model, ...(options.fallbackModels ?? [])]
    .map((value) => parseOpenCodeModelRef(value, defaultProvider));
  const directoryHeader = options.directory;
  const cooldownUntilByModel = new Map<string, number>();

  const headers = (): Record<string, string> => ({
    "Content-Type": "application/json",
    ...(directoryHeader ? { "x-opencode-directory": directoryHeader } : {}),
  });

  const createSession = async (): Promise<string> => {
    const session = await jsonFetch<{ id: string }>(`${baseUrl}/session`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ title: "baseAgent-opencode-bridge" }),
    }, timeoutMs);

    if (!session?.id) throw new Error("OpenCode session creation failed: missing session id");
    return session.id;
  };

  /** Pick the first non-cooled-down model ref. Returns null if all are in cooldown. */
  const pickModelRef = (): OpenCodeModelRef | null => {
    const now = Date.now();
    for (const ref of modelRefs) {
      const key = `${ref.providerID}/${ref.modelID}`;
      const until = cooldownUntilByModel.get(key);
      if (typeof until === "number" && until > now) continue;
      if (typeof until === "number") cooldownUntilByModel.delete(key);
      return ref;
    }
    return null;
  };

  const cooldownModel = (ref: OpenCodeModelRef, reason: FallbackReason) => {
    if (modelCooldownReasons.has(reason) && modelCooldownMs > 0) {
      cooldownUntilByModel.set(`${ref.providerID}/${ref.modelID}`, Date.now() + modelCooldownMs);
    }
  };

  /**
   * Core streaming implementation:
   * 1. Create OpenCode session
   * 2. Subscribe to GET /event SSE
   * 3. Fire POST /session/:id/prompt_async
   * 4. Yield LanguageModelV1StreamParts from SSE events
   */
  const runStreaming = async (prompt: unknown): Promise<{
    stream: ReadableStream<LanguageModelV1StreamPart>;
    rawCall: { rawPrompt: unknown; rawSettings: Record<string, unknown> };
  }> => {
    const modelRef = pickModelRef();
    if (!modelRef) {
      throw new Error("OpenCode bridge: all configured models are in cooldown");
    }

    const sessionId = await createSession();
    const { user } = splitPrompt(prompt);

    // 1. Subscribe to SSE event stream
    const sseController = new AbortController();
    const sseResponse = await fetch(`${baseUrl}/event`, {
      headers: {
        Accept: "text/event-stream",
        ...(directoryHeader ? { "x-opencode-directory": directoryHeader } : {}),
      },
      signal: sseController.signal,
    });

    if (!sseResponse.ok || !sseResponse.body) {
      sseController.abort();
      throw new Error(`OpenCode SSE connection failed: HTTP ${sseResponse.status}`);
    }

    // 2. Fire async prompt (non-blocking)
    // Do NOT await the response — the prompt_async endpoint returns 204 immediately.
    // Send only the user payload via `parts`.
    const promptBody: Record<string, unknown> = {
      model: modelRef,
      parts: [{ type: "text", text: user }],
    };
    const promptFetch = fetch(`${baseUrl}/session/${sessionId}/prompt_async`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(promptBody),
    }).catch((err) => {
      // Will be caught by SSE error handling
      sseController.abort();
      throw err;
    });

    // 3. Build the ReadableStream from SSE events
    const stream = new ReadableStream<LanguageModelV1StreamPart>({
      async start(controller) {
        // Wait for prompt_async to confirm acceptance
        try {
          const resp = await promptFetch;
          if (!resp.ok) {
            const body = await resp.text().catch(() => "");
            const err = new Error(`OpenCode prompt_async failed: HTTP ${resp.status}: ${body}`);
            cooldownModel(modelRef, classifyBridgeError(err));
            controller.error(err);
            sseController.abort();
            return;
          }
        } catch (err) {
          cooldownModel(modelRef, classifyBridgeError(err));
          controller.error(err);
          sseController.abort();
          return;
        }

        // Accumulate usage from step-finish events
        let totalPromptTokens = 0;
        let totalCompletionTokens = 0;
        let finished = false;
        // Track text snapshots per part ID so we can diff full-text updates
        const textSnapshotsByPart = new Map<string, string>();
        // Track message roles so we only forward assistant content.
        // OpenCode streams parts for BOTH user and assistant messages.
        const userMessageIDs = new Set<string>();
        const assistantMessageIDs = new Set<string>();

        // Set overall timeout
        const overallTimeout = setTimeout(() => {
          if (!finished) {
            finished = true;
            controller.enqueue({
              type: "finish",
              finishReason: "error",
              usage: { promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens },
              logprobs: undefined,
              providerMetadata: undefined,
            });
            controller.close();
            sseController.abort();
          }
        }, timeoutMs);

        try {
          for await (const event of parseSseStream(sseResponse, sessionId)) {
            if (finished) break;

            switch (event.type) {
              case "message.part.updated": {
                const { part, delta } = (event as OcEventMessagePartUpdated).properties;

                // Only forward parts that belong to an assistant message.
                // OpenCode streams parts for both user and assistant messages;
                // user parts are the echoed input and must be skipped.
                const partMsgId = (part as { messageID?: string }).messageID;
                if (partMsgId && userMessageIDs.has(partMsgId)) break;
                if (partMsgId && !assistantMessageIDs.has(partMsgId) && assistantMessageIDs.size > 0) break;

                // Text delta — stream it through
                if (part.type === "text" && typeof delta === "string" && delta.length > 0) {
                  controller.enqueue({ type: "text-delta", textDelta: delta });
                  textSnapshotsByPart.set((part as OcTextPart).id, (part as OcTextPart).text ?? "");
                }

                // Full text part (no delta — snapshot mode). Some OpenCode
                // responses arrive as snapshots rather than incremental deltas.
                // Diff against the last known snapshot to emit only new text.
                if (part.type === "text" && !delta && (part as OcTextPart).text) {
                  const textPart = part as OcTextPart;
                  const previous = textSnapshotsByPart.get(textPart.id) ?? "";
                  if (textPart.text.startsWith(previous)) {
                    const suffix = textPart.text.slice(previous.length);
                    if (suffix.length > 0) {
                      controller.enqueue({ type: "text-delta", textDelta: suffix });
                    }
                  } else if (textPart.text !== previous) {
                    controller.enqueue({ type: "text-delta", textDelta: textPart.text });
                  }
                  textSnapshotsByPart.set(textPart.id, textPart.text);
                }

                // Reasoning part
                if (part.type === "reasoning" && typeof delta === "string" && delta.length > 0) {
                  controller.enqueue({ type: "reasoning" as LanguageModelV1StreamPart["type"], textDelta: delta } as LanguageModelV1StreamPart);
                }

                // Tool parts: OpenCode runs its own tools internally. Don't
                // forward their status as text — it pollutes the user response.

                // Step finish — accumulate usage
                if (part.type === "step-finish") {
                  const sf = part as OcStepFinishPart;
                  totalPromptTokens += sf.tokens.input + sf.tokens.cache.read;
                  totalCompletionTokens += sf.tokens.output + sf.tokens.reasoning;
                }
                break;
              }

              case "session.idle": {
                if (!finished) {
                  finished = true;
                  clearTimeout(overallTimeout);
                  controller.enqueue({
                    type: "finish",
                    finishReason: "stop",
                    usage: { promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens },
                    logprobs: undefined,
                    providerMetadata: undefined,
                  });
                  controller.close();
                  sseController.abort();
                }
                break;
              }

              case "session.error": {
                const errEvent = event as OcEventSessionError;
                const errMsg = errEvent.properties.error?.data?.message
                  ?? errEvent.properties.error?.name
                  ?? "Unknown OpenCode error";
                if (!finished) {
                  finished = true;
                  clearTimeout(overallTimeout);
                  cooldownModel(modelRef, classifyBridgeError(new Error(errMsg)));
                  controller.error(new Error(`OpenCode session error: ${errMsg}`));
                  sseController.abort();
                }
                break;
              }

              case "message.updated": {
                // Track which messages are user vs assistant so we can
                // filter out echoed user input from message.part.updated.
                const mu = event as OcEventMessageUpdated;
                const info = mu.properties.info;
                if (info.role === "user") {
                  userMessageIDs.add(info.id);
                } else if (info.role === "assistant") {
                  assistantMessageIDs.add(info.id);
                }
                if (info.role === "assistant" && info.tokens) {
                  // Use as authoritative if we have it (overrides step-finish accumulation)
                  totalPromptTokens = info.tokens.input;
                  totalCompletionTokens = info.tokens.output + info.tokens.reasoning;
                }
                if (info.role === "assistant" && info.error) {
                  const errMsg = typeof info.error === "object" && info.error !== null
                    ? JSON.stringify(info.error)
                    : String(info.error);
                  if (!finished) {
                    finished = true;
                    clearTimeout(overallTimeout);
                    cooldownModel(modelRef, classifyBridgeError(new Error(errMsg)));
                    controller.error(new Error(`OpenCode model error: ${errMsg}`));
                    sseController.abort();
                  }
                }
                break;
              }

              // session.status with type: "idle" also signals completion
              case "session.status": {
                const ss = event as OcEventSessionStatus;
                if (ss.properties.status.type === "idle" && !finished) {
                  finished = true;
                  clearTimeout(overallTimeout);
                  controller.enqueue({
                    type: "finish",
                    finishReason: "stop",
                    usage: { promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens },
                    logprobs: undefined,
                    providerMetadata: undefined,
                  });
                  controller.close();
                  sseController.abort();
                }
                break;
              }
            }
          }

          // SSE stream ended without explicit session.idle — close gracefully
          if (!finished) {
            finished = true;
            clearTimeout(overallTimeout);
            controller.enqueue({
              type: "finish",
              finishReason: "stop",
              usage: { promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens },
              logprobs: undefined,
              providerMetadata: undefined,
            });
            controller.close();
          }
        } catch (err) {
          if (!finished) {
            finished = true;
            clearTimeout(overallTimeout);
            // Abort errors from our own cleanup are expected
            if (err instanceof DOMException && err.name === "AbortError") {
              controller.enqueue({
                type: "finish",
                finishReason: "stop",
                usage: { promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens },
                logprobs: undefined,
                providerMetadata: undefined,
              });
              controller.close();
            } else {
              cooldownModel(modelRef, classifyBridgeError(err));
              controller.error(err);
            }
          }
          sseController.abort();
        }
      },
    });

    return {
      stream,
      rawCall: { rawPrompt: user, rawSettings: {} },
    };
  };

  return {
    specificationVersion: "v1",
    provider: "opencode.chat",
    modelId: `${modelRefs[0].providerID}/${modelRefs[0].modelID}`,
    defaultObjectGenerationMode: undefined,

    async doGenerate(genOptions) {
      // Use the streaming path and collect the full result
      const { stream } = await runStreaming(genOptions.prompt);
      const reader = stream.getReader();
      let text = "";
      let finishReason: "stop" | "error" = "stop";
      let usage = { promptTokens: 0, completionTokens: 0 };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value.type === "text-delta") {
          text += value.textDelta;
        } else if (value.type === "finish") {
          finishReason = (value.finishReason ?? "stop") as "stop" | "error";
          usage = value.usage as { promptTokens: number; completionTokens: number };
        }
      }

      return {
        text,
        finishReason,
        usage,
        rawCall: { rawPrompt: null, rawSettings: {} },
      };
    },

    async doStream(streamOptions) {
      return runStreaming(streamOptions.prompt);
    },
  } as LanguageModelV1;
}
