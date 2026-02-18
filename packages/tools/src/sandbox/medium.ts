import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ShellExecOpts } from "./types.js";

const RESTRICTED_PATH = "/usr/local/bin:/usr/bin:/bin";

/**
 * Run a shell command in a medium-security sandbox:
 * - Restricted PATH (no sbin, no user-installed tools)
 * - Isolated HOME/TMPDIR in a fresh temp dir (prevents ~/.ssh, ~/.aws access)
 * - ulimit memory and CPU time caps prepended to command
 * - Temp dir cleaned up after execution
 */
export async function runMediumShell(opts: ShellExecOpts): Promise<string> {
  const { command, workspacePath, timeoutMs, maxMemoryMb, cpuCount } = opts;

  // Create isolated temp directory for HOME/TMPDIR
  const isolatedDir = mkdtempSync(join(tmpdir(), "sandbox-"));

  // Memory limit in KB for ulimit -v
  const memoryKb = maxMemoryMb * 1024;
  // CPU seconds for ulimit -t
  const cpuSeconds = Math.max(1, Math.ceil(cpuCount * (timeoutMs / 1000)));
  // Prepend ulimit restrictions to the command
  const wrappedCommand = `ulimit -v ${memoryKb} 2>/dev/null; ulimit -t ${cpuSeconds} 2>/dev/null; ${command}`;

  const env: Record<string, string> = {
    PATH: RESTRICTED_PATH,
    HOME: isolatedDir,
    TMPDIR: isolatedDir,
    LANG: process.env.LANG ?? "en_US.UTF-8",
    TERM: "dumb",
  };

  try {
    return await new Promise<string>((resolve) => {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeoutMs);

      execFile(
        "/bin/sh",
        ["-c", wrappedCommand],
        {
          cwd: workspacePath,
          env,
          signal: ac.signal,
          maxBuffer: 1024 * 1024,
        },
        (error, stdout, stderr) => {
          clearTimeout(timer);

          if (error && (error.killed || error.code === "ABORT_ERR")) {
            resolve(`[exit: timeout]\nCommand timed out after ${timeoutMs}ms`);
            return;
          }

          const exitCode = error?.code ?? 0;
          let output = `[exit: ${exitCode}]\n${stdout}`;
          if (stderr) {
            output += `\n[stderr]\n${stderr}`;
          }
          resolve(output);
        },
      );
    });
  } finally {
    // Clean up isolated temp directory
    try {
      rmSync(isolatedDir, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  }
}
