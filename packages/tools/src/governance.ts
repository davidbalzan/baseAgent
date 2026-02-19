import { randomUUID } from "node:crypto";
import type { ToolDefinition, ToolPermission, TraceEvent } from "@baseagent/core";
import type { LoopEmitter } from "@baseagent/core";
import { detectInjectionAttempt, sanitizeStringArg } from "@baseagent/core";

export type ToolPolicy = "auto-allow" | "confirm" | "deny";

export interface GovernancePolicy {
  read: ToolPolicy;
  write: ToolPolicy;
  exec: ToolPolicy;
  toolOverrides?: Record<string, ToolPolicy>;
}

export type ConfirmationDelegate = (
  toolName: string,
  permission: ToolPermission,
  args: Record<string, unknown>,
) => Promise<{ approved: true } | { approved: false; reason: string }>;

interface ToolExecResult {
  result: string;
  error?: string;
  durationMs: number;
}

type ExecuteToolFn = (name: string, args: Record<string, unknown>) => Promise<ToolExecResult>;

export interface GovernanceRateLimiter {
  check(key: string): { allowed: boolean; retryAfterMs?: number };
}

export interface GovernanceOptions {
  policy: GovernancePolicy;
  getToolDefinition: (name: string) => ToolDefinition | undefined;
  confirmationDelegate?: ConfirmationDelegate;
  emitter?: LoopEmitter;
  sessionId?: string;
  rateLimiter?: GovernanceRateLimiter;
}

const MAX_ARG_CHARS = 500;

function truncateArgs(args: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string" && value.length > MAX_ARG_CHARS) {
      result[key] = value.slice(0, MAX_ARG_CHARS) + `...[truncated]`;
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Strip null bytes from all string arguments (GV-6).
 * Null bytes have no legitimate use in tool args and can cause unexpected
 * behaviour in child processes or file writes.
 */
function sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    result[key] = typeof value === "string" ? sanitizeStringArg(value) : value;
  }
  return result;
}

function emitGovernanceTrace(
  emitter: LoopEmitter | undefined,
  sessionId: string | undefined,
  data: Record<string, unknown>,
): void {
  if (!emitter) return;
  const event: TraceEvent = {
    id: randomUUID(),
    sessionId: sessionId ?? "unknown",
    phase: "governance",
    iteration: 0,
    data,
    timestamp: new Date().toISOString(),
  };
  emitter.emit("trace", event);
}

export function createGovernedExecutor(
  innerExecutor: ExecuteToolFn,
  options: GovernanceOptions,
): ExecuteToolFn {
  const { policy, getToolDefinition, confirmationDelegate, emitter, sessionId, rateLimiter } = options;

  return async (name: string, args: Record<string, unknown>): Promise<ToolExecResult> => {
    const start = Date.now();
    const toolDef = getToolDefinition(name);
    const permission: ToolPermission = toolDef?.permission ?? "read";
    const effectivePolicy = policy.toolOverrides?.[name] ?? policy[permission];

    // GV-6: sanitize args (strip null bytes) before any further processing
    const sanitized = sanitizeArgs(args);
    const truncatedArgs = truncateArgs(sanitized);

    // GV-6: detect prompt injection patterns in string args; emit trace event
    // (informational — does not block execution)
    const argStrings = Object.values(sanitized).filter((v): v is string => typeof v === "string");
    if (argStrings.some(detectInjectionAttempt)) {
      emitGovernanceTrace(emitter, sessionId, {
        type: "injection_attempt",
        toolName: name,
        decision: "flagged",
        args: truncatedArgs,
      });
    }

    if (effectivePolicy === "deny") {
      emitGovernanceTrace(emitter, sessionId, {
        type: "gate",
        toolName: name,
        permission,
        decision: "denied",
        args: truncatedArgs,
      });
      return {
        result: "",
        error: `Tool "${name}" is denied by governance policy (permission: ${permission}).`,
        durationMs: Date.now() - start,
      };
    }

    if (effectivePolicy === "confirm") {
      if (!confirmationDelegate) {
        emitGovernanceTrace(emitter, sessionId, {
          type: "gate",
          toolName: name,
          permission,
          decision: "skipped_no_delegate",
          args: truncatedArgs,
        });
        return {
          result: "",
          error: `Tool "${name}" requires confirmation but no interactive session is available (permission: ${permission}).`,
          durationMs: Date.now() - start,
        };
      }

      const confirmation = await confirmationDelegate(name, permission, args);
      if (!confirmation.approved) {
        emitGovernanceTrace(emitter, sessionId, {
          type: "gate",
          toolName: name,
          permission,
          decision: "rejected",
          reason: confirmation.reason,
          args: truncatedArgs,
        });
        return {
          result: "",
          error: `Tool "${name}" was rejected by user: ${confirmation.reason}`,
          durationMs: Date.now() - start,
        };
      }

      emitGovernanceTrace(emitter, sessionId, {
        type: "gate",
        toolName: name,
        permission,
        decision: "approved",
        args: truncatedArgs,
      });
    } else {
      // auto-allow
      emitGovernanceTrace(emitter, sessionId, {
        type: "gate",
        toolName: name,
        permission,
        decision: "auto_allowed",
        args: truncatedArgs,
      });
    }

    // Rate limit check (after governance approval, before execution)
    if (rateLimiter) {
      const rl = rateLimiter.check(sessionId ?? "default");
      if (!rl.allowed) {
        emitGovernanceTrace(emitter, sessionId, {
          type: "gate",
          toolName: name,
          permission,
          decision: "rate_limited",
          retryAfterMs: rl.retryAfterMs,
        });
        return {
          result: "",
          error: `Tool "${name}" rate limited. Try again in ${Math.ceil((rl.retryAfterMs ?? 1000) / 1000)}s.`,
          durationMs: Date.now() - start,
        };
      }
    }

    return innerExecutor(name, sanitized);
  };
}
