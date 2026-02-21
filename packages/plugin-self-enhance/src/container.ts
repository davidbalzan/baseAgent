import { execFile } from "node:child_process";
import { resolve } from "node:path";

const DEV_IMAGE = "baseagent-dev:local";
const DEFAULT_TEST_CMD = "pnpm install --frozen-lockfile && pnpm typecheck && pnpm test";
const MAX_OUTPUT_CHARS = 15_000;
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const MAX_MEMORY_MB = 2048;
const CPU_COUNT = 2;

let imageBuilt = false;

async function ensureDevImage(pluginDir: string): Promise<void> {
  if (imageBuilt) return;

  const dockerfilePath = resolve(pluginDir, "Dockerfile.dev");

  await new Promise<void>((resolvePromise, reject) => {
    execFile(
      "docker",
      ["build", "-t", DEV_IMAGE, "-f", dockerfilePath, "."],
      { cwd: pluginDir, timeout: 120_000, maxBuffer: 1024 * 1024 },
      (err, _stdout, stderr) => {
        if (err) {
          reject(new Error(`Failed to build dev image: ${stderr || err.message}`));
        } else {
          imageBuilt = true;
          resolvePromise();
        }
      },
    );
  });
}

export interface TestResult {
  passed: boolean;
  output: string;
  exitCode: number | string;
}

async function runInDocker(
  worktreePath: string,
  command: string,
): Promise<TestResult> {
  const dockerArgs = [
    "run", "--rm",
    "--network", "host",
    "-v", `${worktreePath}:/workspace:rw`,
    "--memory", `${MAX_MEMORY_MB}m`,
    "--memory-swap", `${MAX_MEMORY_MB}m`,
    "--cpus", String(CPU_COUNT),
    "-w", "/workspace",
    DEV_IMAGE,
    "/bin/sh", "-c", command,
  ];

  return new Promise<TestResult>((resolveResult) => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);

    execFile("docker", dockerArgs, {
      signal: ac.signal,
      maxBuffer: 4 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      clearTimeout(timer);

      if (error && (error.killed || error.code === "ABORT_ERR")) {
        resolveResult({
          passed: false,
          output: truncate(`[timeout after ${TIMEOUT_MS / 1000}s]\n${stdout}\n${stderr}`),
          exitCode: "timeout",
        });
        return;
      }

      const exitCode = typeof error?.code === "number" ? error.code : (error ? 1 : 0);
      let output = stdout;
      if (stderr) output += `\n[stderr]\n${stderr}`;

      resolveResult({
        passed: exitCode === 0,
        output: truncate(output),
        exitCode,
      });
    });
  });
}

async function runDirect(
  worktreePath: string,
  command: string,
): Promise<TestResult> {
  return new Promise<TestResult>((resolveResult) => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);

    execFile("/bin/sh", ["-c", command], {
      cwd: worktreePath,
      signal: ac.signal,
      maxBuffer: 4 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      clearTimeout(timer);

      if (error && (error.killed || error.code === "ABORT_ERR")) {
        resolveResult({
          passed: false,
          output: truncate(`[timeout after ${TIMEOUT_MS / 1000}s]\n${stdout}\n${stderr}`),
          exitCode: "timeout",
        });
        return;
      }

      const exitCode = typeof error?.code === "number" ? error.code : (error ? 1 : 0);
      let output = stdout;
      if (stderr) output += `\n[stderr]\n${stderr}`;

      resolveResult({
        passed: exitCode === 0,
        output: truncate(output),
        exitCode,
      });
    });
  });
}

export async function runTests(
  worktreePath: string,
  opts: { useDocker: boolean; pluginDir: string; command?: string },
  log: (msg: string) => void,
): Promise<TestResult> {
  const cmd = opts.command ?? DEFAULT_TEST_CMD;

  if (opts.useDocker) {
    log("Building dev Docker image (cached after first run)...");
    await ensureDevImage(opts.pluginDir);
    log("Running tests in Docker container...");
    return runInDocker(worktreePath, cmd);
  }

  log("Running tests directly...");
  return runDirect(worktreePath, cmd);
}

function truncate(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  const half = Math.floor(MAX_OUTPUT_CHARS / 2);
  return (
    text.slice(0, half) +
    `\n\n... [truncated ${text.length - MAX_OUTPUT_CHARS} chars] ...\n\n` +
    text.slice(-half)
  );
}
