import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createLogger, type AppConfig } from "@baseagent/core";
import type { SendProactiveMessageFn } from "@baseagent/gateway";
import { runSession, type RunSessionDeps, type RunSessionResult } from "./run-session.js";

const log = createLogger("heartbeat");

export interface HeartbeatScheduler {
  start(): void;
  stop(): void;
  /** Exposed for testing. */
  tick(): Promise<void>;
}

export type RunSessionFn = (
  input: { input: string; channelId?: string },
  deps: RunSessionDeps,
) => Promise<RunSessionResult>;

export interface HeartbeatDeps {
  config: AppConfig;
  sessionDeps: RunSessionDeps;
  workspacePath: string;
  sendProactiveMessage?: SendProactiveMessageFn;
  /** Override for testing — defaults to the real runSession. */
  runSessionFn?: RunSessionFn;
}

const NO_ACTION_PHRASES = [
  "all clear",
  "no actions needed",
  "no action needed",
  "no tasks due",
  "nothing to do",
  "no items due",
];

/** Returns true if the output indicates the agent found nothing to act on. */
export function isNoActionOutput(output: string): boolean {
  const lower = output.toLowerCase().trim();
  return NO_ACTION_PHRASES.some((phrase) => lower.includes(phrase));
}

/** Builds the prompt sent to the agent on each heartbeat tick. */
export function buildHeartbeatPrompt(heartbeatContent: string, now: Date): string {
  const iso = now.toISOString();
  const dayOfWeek = now.toLocaleDateString("en-US", { weekday: "long" });
  const localTime = now.toLocaleTimeString("en-US", { hour12: true, hour: "numeric", minute: "2-digit" });

  return [
    "You are running a scheduled heartbeat check.",
    "",
    `**Current time:** ${iso}`,
    `**Day:** ${dayOfWeek}`,
    `**Local time:** ${localTime}`,
    "",
    "Below is your HEARTBEAT.md schedule. Review the items and determine which (if any) are due now.",
    "If any items are due, execute them. If nothing is due, reply with exactly: \"All clear — no actions needed.\"",
    "",
    "---",
    "",
    heartbeatContent,
  ].join("\n");
}

export function createHeartbeatScheduler(deps: HeartbeatDeps): HeartbeatScheduler {
  const { config, sessionDeps, workspacePath, sendProactiveMessage } = deps;
  const runSessionImpl = deps.runSessionFn ?? runSession;
  const intervalMs = config.heartbeat?.intervalMs ?? 1_800_000;
  const channelId = config.heartbeat?.channelId;

  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;

  async function tick(): Promise<void> {
    if (running) {
      log.log("Tick skipped — previous tick still running");
      return;
    }

    running = true;
    log.log("Running tick...");

    try {
      // Read HEARTBEAT.md fresh each tick
      const heartbeatPath = resolve(workspacePath, "HEARTBEAT.md");
      let content: string;
      try {
        content = readFileSync(heartbeatPath, "utf-8");
      } catch {
        log.log("HEARTBEAT.md not found or unreadable — skipping");
        return;
      }

      if (!content.trim()) {
        log.log("HEARTBEAT.md is empty — skipping");
        return;
      }

      const prompt = buildHeartbeatPrompt(content, new Date());

      const result = await runSessionImpl(
        { input: prompt, channelId: "heartbeat:internal" },
        sessionDeps,
      );

      const output = result.output;
      log.log(`Tick complete — output: ${output.slice(0, 120)}${output.length > 120 ? "..." : ""}`);

      // Send to channel if configured and output is actionable
      if (channelId && sendProactiveMessage && !isNoActionOutput(output)) {
        try {
          await sendProactiveMessage(channelId, output);
          log.log(`Sent result to ${channelId}`);
        } catch (err) {
          log.error(`Failed to send proactive message: ${err}`);
        }
      }
    } catch (err) {
      log.error(`Tick failed: ${err}`);
    } finally {
      running = false;
    }
  }

  return {
    start() {
      log.log(`Starting scheduler (interval: ${intervalMs}ms)`);
      // Run first tick immediately
      tick();
      timer = setInterval(tick, intervalMs);
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      log.log("Scheduler stopped");
    },
    tick,
  };
}
