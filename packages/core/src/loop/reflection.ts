import type { ToolDefinition } from "../schemas/tool.schema.js";

export interface ReflectionPreCheck {
  risk: "low" | "medium" | "high";
  shouldBlock: boolean;
  summary: string;
  recommendation?: string;
}

export interface ReflectionPostCheck {
  outcome: "ok" | "error";
  summary: string;
  recommendation?: string;
  shouldNudge: boolean;
}

export interface ReflectionSessionSummary {
  preChecks: number;
  blockedCalls: number;
  highRiskCalls: number;
  postChecks: number;
  postErrors: number;
  nudgesInjected: number;
  estimatedPromptOverheadTokens: number;
  estimatedCostUsd: number;
}

const HEX_ID_PREFIX = /^[a-f0-9-]{4,}$/i;

function truncate(text: string, max = 220): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function isProtectedHeartbeatEdit(toolName: string, args: Record<string, unknown>): boolean {
  if (toolName !== "file_edit" && toolName !== "file_write") return false;
  const path = typeof args.path === "string" ? args.path : "";
  return /(^|[\\/])HEARTBEAT\.md$/i.test(path);
}

export function reflectBeforeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  toolDef: ToolDefinition | undefined,
): ReflectionPreCheck {
  if (!toolDef) {
    return {
      risk: "high",
      shouldBlock: true,
      summary: `Tool "${toolName}" is not available in this session.`,
      recommendation: "Use only tools present in the current tool list.",
    };
  }

  if ((toolDef.permission === "write" || toolDef.permission === "exec") && Object.keys(args).length === 0) {
    return {
      risk: "medium",
      shouldBlock: false,
      summary: `Tool "${toolName}" is ${toolDef.permission} but was called with empty args.`,
      recommendation: "Verify required parameters before execution.",
    };
  }

  if (isProtectedHeartbeatEdit(toolName, args)) {
    return {
      risk: "high",
      shouldBlock: true,
      summary: "HEARTBEAT.md is protected from direct file edits.",
      recommendation: "Use heartbeat_register to update schedule items safely.",
    };
  }

  if (toolName === "cancel_scheduled_task" && typeof args.taskId === "string") {
    const raw = args.taskId.trim();
    if (raw.length > 0 && !HEX_ID_PREFIX.test(raw)) {
      return {
        risk: "medium",
        shouldBlock: false,
        summary: `Task id "${truncate(raw, 40)}" does not look like a task id prefix.`,
        recommendation: "Call list_scheduled_tasks and use the id prefix shown in that output.",
      };
    }
  }

  return {
    risk: "low",
    shouldBlock: false,
    summary: "No pre-action issues detected.",
  };
}

export function reflectAfterToolCall(
  toolName: string,
  args: Record<string, unknown>,
  result: string,
  error?: string,
): ReflectionPostCheck {
  if (!error) {
    return {
      outcome: "ok",
      summary: truncate(result || "Tool completed successfully."),
      shouldNudge: false,
    };
  }

  const err = String(error);

  if (toolName === "cancel_scheduled_task" && err.includes("No task found with ID starting with")) {
    return {
      outcome: "error",
      summary: truncate(err),
      recommendation: "Use list_scheduled_tasks first, then cancel using the exact id prefix from the list.",
      shouldNudge: true,
    };
  }

  if (err.includes("protected memory file") && err.includes("HEARTBEAT.md")) {
    return {
      outcome: "error",
      summary: truncate(err),
      recommendation: "Use heartbeat_register for HEARTBEAT updates instead of file_edit/file_write.",
      shouldNudge: true,
    };
  }

  if (isProtectedHeartbeatEdit(toolName, args)) {
    return {
      outcome: "error",
      summary: truncate(err),
      recommendation: "Use heartbeat_register for schedule additions/updates.",
      shouldNudge: true,
    };
  }

  return {
    outcome: "error",
    summary: truncate(err),
    shouldNudge: false,
  };
}
