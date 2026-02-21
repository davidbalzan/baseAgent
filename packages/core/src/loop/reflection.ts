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

export interface CompletionGateInput {
  totalToolCalls: number;
  totalToolErrors: number;
  totalToolSuccesses: number;
  output: string;
  toolStats?: Record<string, { success: number; error: number }>;
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

export function shouldNudgeForWeakCompletion(input: CompletionGateInput): {
  shouldNudge: boolean;
  reason?: string;
  recommendation?: string;
} {
  if (input.totalToolCalls === 0) {
    return { shouldNudge: false };
  }

  const text = String(input.output || "");
  const mentionsFailure = /\b(error|failed|unable|could not|cannot|can't|did not|didn't)\b/i.test(text);

  const stats = input.toolStats ?? {};
  const cancelOk = stats.cancel_scheduled_task?.success ?? 0;
  const cancelErr = stats.cancel_scheduled_task?.error ?? 0;
  const listOk = stats.list_scheduled_tasks?.success ?? 0;
  const claimsCancelled = /\b(cancelled|canceled|all cancelled|tasks? cancelled|removed all tasks?)\b/i.test(text);

  if (claimsCancelled && cancelOk === 0 && (cancelErr > 0 || listOk > 0)) {
    return {
      shouldNudge: true,
      reason: "missing_evidence_for_scheduler_claim",
      recommendation:
        "Your summary claims tasks were cancelled, but there is no successful cancel_scheduled_task result. Re-check task IDs and report what actually succeeded vs failed.",
    };
  }

  const scheduleOk = stats.schedule_task?.success ?? 0;
  const claimsScheduled = /\b(scheduled|created schedule|set (a )?task)\b/i.test(text);
  if (claimsScheduled && scheduleOk === 0 && (stats.schedule_task?.error ?? 0) > 0) {
    return {
      shouldNudge: true,
      reason: "missing_evidence_for_schedule_claim",
      recommendation:
        "Your summary claims scheduling succeeded, but schedule_task did not succeed. Verify arguments, retry if appropriate, and report actual results.",
    };
  }

  const memoryWriteOk = (stats.memory_write?.success ?? 0) + (stats.add_system_context?.success ?? 0);
  const memoryWriteErr = (stats.memory_write?.error ?? 0) + (stats.add_system_context?.error ?? 0);
  const claimsMemoryUpdated = /\b(saved to memory|wrote to memory|updated memory|stored in memory|added to context|updated context)\b/i.test(text);
  if (claimsMemoryUpdated && memoryWriteOk === 0 && memoryWriteErr > 0) {
    return {
      shouldNudge: true,
      reason: "missing_evidence_for_memory_claim",
      recommendation:
        "Your summary claims memory/context updates, but those tools did not succeed. Report the actual failure and next corrective step.",
    };
  }

  const installOk = stats.install_plugin?.success ?? 0;
  const installErr = stats.install_plugin?.error ?? 0;
  const claimsInstalled = /\b(installed plugin|plugin installed|added plugin)\b/i.test(text);
  if (claimsInstalled && installOk === 0 && installErr > 0) {
    return {
      shouldNudge: true,
      reason: "missing_evidence_for_plugin_install_claim",
      recommendation:
        "Your summary claims plugin installation succeeded, but install_plugin failed. Report the failure details and remediation.",
    };
  }

  const removeOk = stats.remove_plugin?.success ?? 0;
  const removeErr = stats.remove_plugin?.error ?? 0;
  const claimsRemoved = /\b(removed plugin|plugin removed|uninstalled plugin)\b/i.test(text);
  if (claimsRemoved && removeOk === 0 && removeErr > 0) {
    return {
      shouldNudge: true,
      reason: "missing_evidence_for_plugin_remove_claim",
      recommendation:
        "Your summary claims plugin removal succeeded, but remove_plugin failed. Report what actually happened.",
    };
  }

  const fileWriteOk = (stats.file_edit?.success ?? 0) + (stats.file_write?.success ?? 0);
  const fileWriteErr = (stats.file_edit?.error ?? 0) + (stats.file_write?.error ?? 0);
  const claimsFileUpdated = /\b(updated file|edited file|modified file|changed file|patched file)\b/i.test(text);
  if (claimsFileUpdated && fileWriteOk === 0 && fileWriteErr > 0) {
    return {
      shouldNudge: true,
      reason: "missing_evidence_for_file_change_claim",
      recommendation:
        "Your summary claims file updates, but file edit/write tools did not succeed. Report the real outcome and blockers.",
    };
  }

  if (input.totalToolErrors > 0 && input.totalToolSuccesses === 0 && !mentionsFailure) {
    return {
      shouldNudge: true,
      reason: "unverified_completion_after_failures",
      recommendation:
        "Before finishing, verify outcomes and clearly report tool failures, why they happened, and what the user can do next.",
    };
  }

  return { shouldNudge: false };
}
