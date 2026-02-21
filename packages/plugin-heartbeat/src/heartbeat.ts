import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createLogger, type RunSessionLikeFn } from "@baseagent/core";

const log = createLogger("heartbeat");

export interface HeartbeatScheduler {
  start(): void;
  stop(): void;
  tick(): Promise<void>;
}

export interface HeartbeatDeps {
  intervalMs: number;
  channelId?: string;
  workspacePath: string;
  runSession: RunSessionLikeFn;
  sendProactiveMessage?: (channelId: string, text: string) => Promise<void>;
  reviewIntervalMs?: number;
  listDistinctChannels?: () => Array<{ channelId: string; sessionCount: number }>;
}

const NO_ACTION_PHRASES = [
  "all clear",
  "no actions needed",
  "no action needed",
  "no tasks due",
  "nothing to do",
  "no items due",
];

export function isNoActionOutput(output: string): boolean {
  const lower = output.toLowerCase().trim();
  return NO_ACTION_PHRASES.some((phrase) => lower.includes(phrase));
}

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

export function buildReviewPrompt(channelId: string): string {
  return [
    `You are performing a periodic memory review for channel "${channelId}".`,
    "",
    `1. Call review_sessions with channelId="${channelId}" and daysBack=7`,
    "2. Analyze the conversations for insights worth remembering:",
    "   - User preferences, habits, recurring interests",
    "   - Personal facts (names, locations, dates)",
    "   - Corrections or clarifications the user made",
    "   - Communication style patterns",
    "3. Call memory_write to persist key findings to USER.md",
    "4. Only write NEW insights not already captured in the user's profile",
    "",
    'If there are no new insights worth recording, reply: "All clear — no actions needed."',
  ].join("\n");
}

const DEFAULT_REVIEW_INTERVAL_MS = 21_600_000; // 6 hours

export function createHeartbeatScheduler(deps: HeartbeatDeps): HeartbeatScheduler {
  const {
    intervalMs, channelId, workspacePath, runSession,
    sendProactiveMessage, listDistinctChannels,
    reviewIntervalMs = DEFAULT_REVIEW_INTERVAL_MS,
  } = deps;

  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;
  let lastReviewAt = 0;

  function shouldReview(): boolean {
    return Date.now() - lastReviewAt >= reviewIntervalMs;
  }

  async function reviewMemory(): Promise<void> {
    if (!listDistinctChannels || !shouldReview()) return;

    const channels = listDistinctChannels();
    if (channels.length === 0) {
      log.log("Memory review: no active channels found");
      lastReviewAt = Date.now();
      return;
    }

    log.log(`Memory review: ${channels.length} channel(s)`);

    for (const { channelId: ch } of channels) {
      try {
        const prompt = buildReviewPrompt(ch);
        const result = await runSession({ input: prompt, channelId: ch });
        const output = result.output;
        if (isNoActionOutput(output)) {
          log.log(`Memory review [${ch}]: no new insights`);
        } else {
          log.log(`Memory review [${ch}]: ${output.slice(0, 120)}${output.length > 120 ? "..." : ""}`);
        }
      } catch (err) {
        log.error(`Memory review [${ch}] failed: ${err}`);
      }
    }

    lastReviewAt = Date.now();
  }

  async function tick(): Promise<void> {
    if (running) {
      log.log("Tick skipped — previous tick still running");
      return;
    }

    running = true;
    log.log("Running tick...");

    try {
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
      const result = await runSession({ input: prompt, channelId: "heartbeat:internal" });

      const output = result.output;
      log.log(`Tick complete — output: ${output.slice(0, 120)}${output.length > 120 ? "..." : ""}`);

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
      // Run memory review after the main tick completes
      try {
        await reviewMemory();
      } catch (err) {
        log.error(`Memory review failed: ${err}`);
      }
      running = false;
    }
  }

  return {
    start() {
      log.log(`Starting scheduler (interval: ${intervalMs}ms)`);
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
