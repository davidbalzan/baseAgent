import { randomUUID } from "node:crypto";
import { streamText, jsonSchema, type LanguageModel, type CoreMessage, type CoreTool } from "ai";
import type { ToolDefinition } from "../schemas/tool.schema.js";
import type { TraceEvent } from "../schemas/trace.schema.js";
import { LoopEmitter } from "./loop-events.js";
import { createLoopState, updateUsage, type LoopState, type ModelPricing } from "./loop-state.js";
import { compactMessages, persistCompactionSummary, decayToolOutputs, type ToolMessageMeta } from "./compaction.js";
import { wrapUserInput } from "./injection-defense.js";
import { createToolFailureState, processToolResults } from "./tool-failure-tracker.js";
import {
  reflectBeforeToolCall,
  reflectAfterToolCall,
  type ReflectionSessionSummary,
} from "./reflection.js";

export interface AgentLoopOptions {
  model: LanguageModel;
  systemPrompt: string;
  tools: Record<string, ToolDefinition>;
  executeTool: (name: string, args: Record<string, unknown>) => Promise<{ result: string; error?: string; durationMs: number }>;
  maxIterations: number;
  timeoutMs: number;
  costCapUsd: number;
  sessionId?: string;
  compactionThreshold?: number;
  workspacePath?: string;
  toolOutputDecayIterations?: number;
  toolOutputDecayThresholdChars?: number;
  /** Pricing rates for cost estimation. Falls back to conservative defaults if omitted. */
  pricing?: ModelPricing;
  /** Stronger model used for compaction summarization. Falls back to the loop model if omitted. */
  compactionModel?: LanguageModel;
  /** Per-user directory for writing compaction summaries. Falls back to workspacePath when omitted. */
  userDir?: string;
  /** Prior exchanges from previous sessions on the same channel, injected before the current input. */
  conversationHistory?: CoreMessage[];
  /** Pre-existing message history for resume. When set, the `input` param is unused. */
  initialMessages?: CoreMessage[];
  initialToolMessageMeta?: ToolMessageMeta[];
  initialState?: Partial<LoopState>;
  reflection?: {
    enabled?: boolean;
    preActionChecks?: boolean;
    postActionChecks?: boolean;
    maxNudgesPerIteration?: number;
    sessionSummary?: boolean;
    persistToUserMemory?: boolean;
  };
}

export interface AgentLoopResult {
  sessionId: string;
  output: string;
  state: LoopState;
  messages: CoreMessage[];
  toolMessageMeta: ToolMessageMeta[];
  reflectionSummary?: ReflectionSessionSummary;
}

function toolsToSdkFormat(tools: Record<string, ToolDefinition>): Record<string, CoreTool> {
  const sdkTools: Record<string, CoreTool> = {};
  for (const [name, def] of Object.entries(tools)) {
    sdkTools[name] = {
      description: def.description,
      parameters: def.jsonSchema ? jsonSchema(def.jsonSchema) : def.parameters,
    };
  }
  return sdkTools;
}

function emitTrace(
  emitter: LoopEmitter,
  sessionId: string,
  phase: TraceEvent["phase"],
  iteration: number,
  data?: Record<string, unknown>,
  tokens?: { prompt: number; completion: number; cost: number },
): void {
  const event: TraceEvent = {
    id: randomUUID(),
    sessionId,
    phase,
    iteration,
    data,
    promptTokens: tokens?.prompt,
    completionTokens: tokens?.completion,
    costUsd: tokens?.cost,
    timestamp: new Date().toISOString(),
  };
  emitter.emit("trace", event);
}

/**
 * Execute an agent loop: stream LLM responses, execute tool calls, and iterate.
 *
 * @param input - User input text. Ignored when `options.initialMessages` is
 *   provided (resume scenario) — pass empty string in that case.
 * @param options - Loop configuration including model, tools, and budgets.
 * @param emitter - Optional event emitter for observability.
 */
export async function runAgentLoop(
  input: string,
  options: AgentLoopOptions,
  emitter?: LoopEmitter,
): Promise<AgentLoopResult> {
  const {
    model,
    systemPrompt,
    tools,
    executeTool,
    maxIterations,
    timeoutMs,
    costCapUsd,
    sessionId: providedSessionId,
    compactionThreshold,
    workspacePath,
    toolOutputDecayIterations,
    toolOutputDecayThresholdChars,
    userDir,
    compactionModel,
    pricing,
    conversationHistory,
    initialMessages,
    initialToolMessageMeta,
    initialState,
    reflection,
  } = options;

  const sessionId = providedSessionId ?? randomUUID();
  const loopEmitter = emitter ?? new LoopEmitter();
  const state = createLoopState();
  if (initialState) {
    Object.assign(state, initialState);
  }
  state.status = "running";

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);

  const messages: CoreMessage[] = initialMessages
    ? [...initialMessages]
    : [
        { role: "system", content: systemPrompt },
        // Wrap prior conversation history user turns so they are also tagged
        ...(conversationHistory ?? []).map((m) =>
          m.role === "user" && typeof m.content === "string"
            ? { ...m, content: wrapUserInput(m.content) }
            : m,
        ),
        { role: "user", content: wrapUserInput(input) },
      ];

  const sdkTools = toolsToSdkFormat(tools);
  let finalOutput = "";
  let narrationNudges = 0;
  const MAX_NARRATION_NUDGES = 2;
  const failureState = createToolFailureState();
  const toolMessageMeta: ToolMessageMeta[] = initialToolMessageMeta
    ? [...initialToolMessageMeta]
    : [];
  const reflectionEnabled = reflection?.enabled ?? false;
  const reflectionPreEnabled = reflection?.preActionChecks ?? true;
  const reflectionPostEnabled = reflection?.postActionChecks ?? true;
  const maxReflectionNudgesPerIteration = reflection?.maxNudgesPerIteration ?? 1;
  const reflectionSessionSummaryEnabled = reflection?.sessionSummary ?? true;
  const reflectionStats: ReflectionSessionSummary = {
    preChecks: 0,
    blockedCalls: 0,
    highRiskCalls: 0,
    postChecks: 0,
    postErrors: 0,
    nudgesInjected: 0,
    estimatedPromptOverheadTokens: 0,
    estimatedCostUsd: 0,
  };

  emitTrace(loopEmitter, sessionId, "session_start", 0, { input });

  try {
    while (state.iteration < maxIterations && state.estimatedCostUsd < costCapUsd) {
      state.iteration++;

      const response = streamText({
        model,
        messages,
        tools: sdkTools,
        abortSignal: abortController.signal,
      });

      let iterationText = "";
      let reasoningText = "";
      const toolCalls: Array<{ toolCallId: string; toolName: string; args: Record<string, unknown> }> = [];

      for await (const part of response.fullStream) {
        if (abortController.signal.aborted) break;

        switch (part.type) {
          case "text-delta":
            iterationText += part.textDelta;
            loopEmitter.emit("text_delta", part.textDelta);
            break;

          case "reasoning":
            reasoningText += part.textDelta;
            break;

          case "tool-call":
            toolCalls.push({
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              args: part.args as Record<string, unknown>,
            });
            loopEmitter.emit("tool_call", {
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              args: part.args as Record<string, unknown>,
            });
            break;
        }
      }

      const usage = await response.usage;
      const reasoningTokens = (usage as Record<string, unknown>).outputTokenDetails
        ? ((usage as Record<string, unknown>).outputTokenDetails as { reasoningTokens?: number }).reasoningTokens
        : undefined;
      updateUsage(state, usage.promptTokens, usage.completionTokens, pricing);

      emitTrace(loopEmitter, sessionId, "reason", state.iteration, {
        text: iterationText,
        toolCallCount: toolCalls.length,
        ...(reasoningText ? { reasoningText } : {}),
        ...(reasoningTokens ? { reasoningTokens } : {}),
      }, {
        prompt: usage.promptTokens,
        completion: usage.completionTokens,
        cost: state.estimatedCostUsd,
      });

      // Append assistant response to message history
      const responseMessages = await response.response;
      messages.push(...responseMessages.messages);

      const finishReason = await response.finishReason;

      if (finishReason !== "tool-calls" || toolCalls.length === 0) {
        // Detect narration: model described plans but didn't call any tools.
        // Only nudge when the response is PRIMARILY planning intent — not a
        // completed answer that happens to contain future-tense phrasing.
        // Heuristic: short text (<300 chars) dominated by planning verbs with
        // no concrete data (numbers, URLs, code blocks) is likely narration.
        const PLAN_VERBS = /\b(I will|I'll|let me|I need to|I'm going to|I should|I can|I am going to)\b/i;
        const HAS_CONTENT = /(\d{2,}|https?:\/\/|```|[A-Z][a-z]+ is |the answer|the result|your |here's|here is)/i;
        const isShortNarration = iterationText.length < 300 && PLAN_VERBS.test(iterationText) && !HAS_CONTENT.test(iterationText);
        // Also detect when the model emits tool-call-like text instead of actual tool calls
        // (e.g. glm-5 outputting `think(thought="...")` as plain text).
        const FAKE_TOOL_CALL = /\b\w+\((?:thought|query|command|url)\s*=/i;
        const isFakeToolCall = FAKE_TOOL_CALL.test(iterationText);
        // Detect hallucination: model claims to have completed a tool-like action
        // (past tense) but didn't actually call any tools. Examples:
        //   "Done! I've scheduled a reminder" (schedule_task not called)
        //   "I've saved the note to memory" (memory_write not called)
        const TOOL_ACTION_CLAIM = /\b(I've |I have |I )(scheduled|set up|created|saved|written|deleted|cancelled|searched|fetched|reminded|notified|sent|updated|modified|added|removed|recorded|stored|looked up)\b/i;
        const isHallucinatedAction = toolCalls.length === 0 && TOOL_ACTION_CLAIM.test(iterationText);

        if ((isShortNarration || isFakeToolCall || isHallucinatedAction) && narrationNudges < MAX_NARRATION_NUDGES) {
          narrationNudges++;
          messages.push({
            role: "user",
            content: isFakeToolCall
              ? "You wrote tool calls as text instead of invoking them. Use the actual tool-calling mechanism — do not write function calls as text."
              : isHallucinatedAction
                ? "You claimed to have completed an action but you did NOT actually call any tools. You MUST use the available tools to perform actions. Call the appropriate tool now."
                : "Do not describe what you plan to do — call the tools now and return the final result.",
          });
          emitTrace(loopEmitter, sessionId, "narration_nudge", state.iteration, {
            narrationText: iterationText,
            nudgeCount: narrationNudges,
            reason: isHallucinatedAction ? "hallucinated_action" : isFakeToolCall ? "fake_tool_call" : "planning_narration",
          });
          // Clear streamed text so the retry starts fresh in the UI.
          loopEmitter.emit("text_reset");
          continue;
        }
        finalOutput = iterationText;
        break;
      }

      // Check for finish tool
      const finishCall = toolCalls.find((tc) => tc.toolName === "finish");
      if (finishCall) {
        finalOutput = (finishCall.args as { summary?: string }).summary ?? iterationText;
        emitTrace(loopEmitter, sessionId, "finish", state.iteration, {
          summary: finalOutput,
        });
        break;
      }

      // Execute tools sequentially
      const toolResults: CoreMessage = {
        role: "tool" as const,
        content: [],
      };
      const reflectionNudges: string[] = [];

      for (const tc of toolCalls) {
        const toolDef = tools[tc.toolName];
        let preCheck = null;
        if (reflectionEnabled && reflectionPreEnabled) {
          preCheck = reflectBeforeToolCall(tc.toolName, tc.args, toolDef);
          reflectionStats.preChecks += 1;
          if (preCheck.risk === "high") reflectionStats.highRiskCalls += 1;
          if (preCheck.shouldBlock) reflectionStats.blockedCalls += 1;
          emitTrace(loopEmitter, sessionId, "reflection_pre", state.iteration, {
            toolName: tc.toolName,
            risk: preCheck.risk,
            shouldBlock: preCheck.shouldBlock,
            summary: preCheck.summary,
            ...(preCheck.recommendation ? { recommendation: preCheck.recommendation } : {}),
          });
        }

        emitTrace(loopEmitter, sessionId, "tool_call", state.iteration, {
          toolName: tc.toolName,
          args: tc.args,
        });

        const execResult = preCheck?.shouldBlock
          ? {
              result: "",
              error: `${preCheck.summary}${preCheck.recommendation ? ` ${preCheck.recommendation}` : ""}`,
              durationMs: 0,
            }
          : await executeTool(tc.toolName, tc.args);

        loopEmitter.emit("tool_result", {
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          result: execResult.result,
          error: execResult.error,
          durationMs: execResult.durationMs,
        });

        emitTrace(loopEmitter, sessionId, "tool_result", state.iteration, {
          toolName: tc.toolName,
          result: execResult.result,
          error: execResult.error,
          durationMs: execResult.durationMs,
        });

        if (reflectionEnabled && reflectionPostEnabled) {
          const postCheck = reflectAfterToolCall(tc.toolName, tc.args, execResult.result, execResult.error);
          reflectionStats.postChecks += 1;
          if (postCheck.outcome === "error") reflectionStats.postErrors += 1;
          emitTrace(loopEmitter, sessionId, "reflection_post", state.iteration, {
            toolName: tc.toolName,
            outcome: postCheck.outcome,
            summary: postCheck.summary,
            ...(postCheck.recommendation ? { recommendation: postCheck.recommendation } : {}),
          });
          if (postCheck.shouldNudge && postCheck.recommendation && reflectionNudges.length < maxReflectionNudgesPerIteration) {
            reflectionNudges.push(postCheck.recommendation);
            reflectionStats.nudgesInjected += 1;
            const nudgeTokens = Math.ceil(postCheck.recommendation.length / 4);
            reflectionStats.estimatedPromptOverheadTokens += nudgeTokens;
            if (pricing?.costPerMInputTokens !== undefined) {
              reflectionStats.estimatedCostUsd += (nudgeTokens / 1_000_000) * pricing.costPerMInputTokens;
            }
          }
        }

        (toolResults.content as Array<{ type: "tool-result"; toolCallId: string; toolName: string; result: string }>).push({
          type: "tool-result",
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          result: execResult.error
            ? `Error: ${execResult.error}`
            : execResult.result,
        });
      }

      messages.push(toolResults);
      toolMessageMeta.push({ messageIndex: messages.length - 1, iteration: state.iteration });
      for (const nudge of reflectionNudges) {
        messages.push({ role: "user", content: nudge });
      }

      // --- Tool failure recovery ---
      // Track per-tool failures and nudge the model when tools are repeatedly broken.
      const toolCallResults = (toolResults.content as Array<{ toolCallId: string; toolName: string; result: string }>)
        .map((r) => ({ toolCallId: r.toolCallId, toolName: r.toolName, isError: r.result.startsWith("Error:") }));
      const recovery = processToolResults(failureState, toolCallResults);
      if (recovery) {
        messages.push({ role: "user", content: recovery.message });
        emitTrace(loopEmitter, sessionId, "tool_failure_recovery", state.iteration, {
          reason: recovery.reason,
          failedTools: recovery.failedTools,
          ...(recovery.failureCounts ? { failureCounts: recovery.failureCounts } : {}),
          ...(recovery.consecutiveAllFailIterations ? { consecutiveAllFailIterations: recovery.consecutiveAllFailIterations } : {}),
        });
      }

      // Decay old tool outputs (cheap, no LLM call)
      if (toolOutputDecayIterations) {
        decayToolOutputs(
          messages,
          toolMessageMeta,
          state.iteration,
          toolOutputDecayIterations,
          toolOutputDecayThresholdChars ?? 500,
        );
      }

      // Auto-compaction: summarize history when context exceeds threshold.
      // Use the capable model for summarization when available (better summaries, cheaper model handles the loop).
      if (compactionThreshold && usage.promptTokens >= compactionThreshold) {
        const { summary, compactedMessages } = await compactMessages(compactionModel ?? model, messages, systemPrompt);
        messages.length = 0;
        messages.push(...compactedMessages);
        // Compaction replaces all messages with a summary. Pre-compaction tool metadata
        // is invalidated since message indices changed. Decay tracking restarts here.
        toolMessageMeta.length = 0;

        if (workspacePath) {
          persistCompactionSummary(workspacePath, summary, userDir);
        }

        emitTrace(loopEmitter, sessionId, "compaction", state.iteration, {
          promptTokensBefore: usage.promptTokens,
          summaryLength: summary.length,
        });
      }

      emitTrace(loopEmitter, sessionId, "observe", state.iteration, {
        toolResultCount: toolCalls.length,
      });
    }

    // Determine final status
    if (state.iteration >= maxIterations) {
      state.status = "completed";
      if (!finalOutput) finalOutput = "Reached maximum iterations.";
    } else if (state.estimatedCostUsd >= costCapUsd) {
      state.status = "cost_limit";
      if (!finalOutput) finalOutput = "Cost cap reached.";
    } else {
      state.status = "completed";
    }
  } catch (err) {
    if (abortController.signal.aborted) {
      state.status = "timeout";
      finalOutput = "Session timed out.";
    } else {
      state.status = "failed";
      finalOutput = err instanceof Error ? err.message : "Unknown error";
      loopEmitter.emit("error", err instanceof Error ? err : new Error(String(err)));
    }
    emitTrace(loopEmitter, sessionId, "error", state.iteration, {
      error: finalOutput,
    });
  } finally {
    clearTimeout(timeout);
  }

  emitTrace(loopEmitter, sessionId, "finish", state.iteration, {
    output: finalOutput,
    ...state,
  });

  if (reflectionEnabled && reflectionSessionSummaryEnabled) {
    emitTrace(loopEmitter, sessionId, "reflection_session", state.iteration, {
      ...reflectionStats,
    });
  }

  loopEmitter.emit("finish", finalOutput);
  loopEmitter.emit("session_complete", {
    sessionId,
    output: finalOutput,
    state,
    messages,
    toolMessageMeta,
    reflectionSummary: reflectionEnabled && reflectionSessionSummaryEnabled ? reflectionStats : undefined,
  });

  return {
    sessionId,
    output: finalOutput,
    state,
    messages,
    toolMessageMeta,
    reflectionSummary: reflectionEnabled && reflectionSessionSummaryEnabled ? reflectionStats : undefined,
  };
}
