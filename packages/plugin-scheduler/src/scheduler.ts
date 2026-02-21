import { createLogger, type RunSessionLikeFn } from "@baseagent/core";
import { TaskStore, type ScheduledTask } from "./task-store.js";

const log = createLogger("scheduler");

export interface TaskScheduler {
  start(): void;
  stop(): void;
  tick(): Promise<void>;
}

export interface TaskSchedulerDeps {
  store: TaskStore;
  runSession: RunSessionLikeFn;
  sendProactiveMessage?: (channelId: string, text: string) => Promise<void>;
  intervalMs?: number;
}

function buildScheduledTaskPrompt(task: ScheduledTask, now: Date): string {
  const iso = now.toISOString();
  const dayOfWeek = now.toLocaleDateString("en-US", { weekday: "long" });
  const localTime = now.toLocaleTimeString("en-US", { hour12: true, hour: "numeric", minute: "2-digit" });

  return [
    "You are handling a scheduled task.",
    "",
    `**Current time:** ${iso}`,
    `**Day:** ${dayOfWeek}`,
    `**Local time:** ${localTime}`,
    "",
    `**Scheduled task:** ${task.task}`,
    "",
    "Carry out the task described above. Provide a clear summary of what you did and any results.",
  ].join("\n");
}

export function createTaskScheduler(deps: TaskSchedulerDeps): TaskScheduler {
  const { store, runSession, sendProactiveMessage } = deps;
  const intervalMs = deps.intervalMs ?? 60_000;

  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;

  async function tick(): Promise<void> {
    if (running) {
      log.log("Tick skipped — previous tick still running");
      return;
    }

    running = true;

    try {
      const due = store.getDue(new Date());
      if (due.length === 0) return;

      log.log(`${due.length} task(s) due — executing`);

      for (const task of due) {
        store.updateStatus(task.id, "running");

        try {
          const prompt = buildScheduledTaskPrompt(task, new Date());
          const result = await runSession({
            input: prompt,
            channelId: task.channelId ?? "scheduler:internal",
          });

          store.updateStatus(task.id, "completed");
          const output = result.output;
          log.log(`Task ${task.id.slice(0, 8)}… completed — output: ${output.slice(0, 120)}${output.length > 120 ? "..." : ""}`);

          if (task.channelId && sendProactiveMessage) {
            try {
              await sendProactiveMessage(task.channelId, output);
              log.log(`Sent result to ${task.channelId}`);
            } catch (err) {
              log.error(`Failed to send proactive message: ${err}`);
            }
          }
        } catch (err) {
          store.updateStatus(task.id, "failed");
          log.error(`Task ${task.id.slice(0, 8)}… failed: ${err}`);
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
