import type {
  LanguageModelV1,
  LanguageModelV1StreamPart,
} from "ai";
import type { FallbackReason } from "./fallback-model.js";

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

export function promptToText(prompt: unknown): string {
  if (!Array.isArray(prompt)) return "";

  const chunks: string[] = [];

  for (const msg of prompt) {
    if (!msg || typeof msg !== "object") continue;
    const role = typeof (msg as { role?: unknown }).role === "string"
      ? String((msg as { role?: string }).role)
      : "user";
    const content = (msg as { content?: unknown }).content;

    if (typeof content === "string") {
      chunks.push(`${role}: ${content}`);
      continue;
    }

    if (Array.isArray(content)) {
      const text = content
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

      if (text) chunks.push(`${role}: ${text}`);
    }
  }

  return chunks.join("\n\n").trim();
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
    const text = promptToText(prompt);

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
    const promptFetch = fetch(`${baseUrl}/session/${sessionId}/prompt_async`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        model: modelRef,
        parts: [{ type: "text", text }],
      }),
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

                // Text delta — stream it through
                if (part.type === "text" && typeof delta === "string" && delta.length > 0) {
                  controller.enqueue({ type: "text-delta", textDelta: delta });
                }

                // Full text part (no delta — final snapshot)
                if (part.type === "text" && !delta && (part as OcTextPart).text) {
                  // Only emit if we haven't been streaming deltas (fallback)
                  // In practice, deltas are preferred; this is a safety net
                }

                // Reasoning part
                if (part.type === "reasoning" && typeof delta === "string" && delta.length > 0) {
                  controller.enqueue({ type: "reasoning" as LanguageModelV1StreamPart["type"], textDelta: delta } as LanguageModelV1StreamPart);
                }

                // Tool part — emit as tool-call-delta / tool-call when completed
                if (part.type === "tool") {
                  const toolPart = part as OcToolPart;
                  if (toolPart.state.status === "completed" || toolPart.state.status === "error") {
                    // Emit a synthetic tool-call event so the agent loop's trace captures it.
                    // The Vercel AI SDK `tool-call` part expects toolCallId, toolName, args.
                    // We emit it as metadata via provider metadata since the SDK doesn't have
                    // a built-in "bridge tool call" part type. Instead we use text annotations.
                    const state = toolPart.state;
                    const toolInfo = `[tool:${toolPart.tool}] `;
                    if (state.status === "completed") {
                      const summary = (state as OcToolStateCompleted).title || toolPart.tool;
                      const output = (state as OcToolStateCompleted).output;
                      const duration = (state as OcToolStateCompleted).time.end - (state as OcToolStateCompleted).time.start;
                      // Emit as a text delta so it appears in the trace
                      controller.enqueue({
                        type: "text-delta",
                        textDelta: `${toolInfo}${summary} (${duration}ms)\n`,
                      });
                    } else if (state.status === "error") {
                      controller.enqueue({
                        type: "text-delta",
                        textDelta: `${toolInfo}ERROR: ${(state as OcToolStateError).error}\n`,
                      });
                    }
                  }
                }

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
                // AssistantMessage completion — can carry final token counts
                const mu = event as OcEventMessageUpdated;
                const info = mu.properties.info;
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
      rawCall: { rawPrompt: text, rawSettings: {} },
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
